import AppKit
import ImageIO
import Network

// Only the published picker may send original GIF bytes to this loopback service.
final class WebCopyBridge {
    static let port: UInt16 = 47653
    private let token = UUID().uuidString
    private var listener: NWListener?
    private var connections: [UUID: NWConnection] = [:]
    private let folder = FileManager.default.temporaryDirectory.appendingPathComponent("jjalkkak-web-" + UUID().uuidString)
    private let limit = 24 * 1024 * 1024
    private var origins: Set<String> {
        var values: Set<String> = ["https://huddling-3team.vercel.app"]
        #if DEBUG
        values.insert("http://127.0.0.1:5178")
        #endif
        return values
    }

    func start(onFailure: @escaping () -> Void) {
        do {
            let parameters = NWParameters.tcp
            parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: NWEndpoint.Port(rawValue: Self.port)!)
            let service = try NWListener(using: parameters)
            service.stateUpdateHandler = { state in
                if case .failed = state { onFailure() }
            }
            service.newConnectionHandler = { [weak self] connection in self?.accept(connection) }
            listener = service
            service.start(queue: .main)
        } catch { onFailure() }
    }

    private func accept(_ connection: NWConnection) {
        guard connections.count < 4 else { connection.cancel(); return }
        let id = UUID()
        connections[id] = connection
        connection.start(queue: .main)
        DispatchQueue.main.asyncAfter(deadline: .now() + 30) { [weak self] in
            self?.connections.removeValue(forKey: id)?.cancel()
        }
        receive(connection, id: id, buffer: Data())
    }

    private func receive(_ connection: NWConnection, id: UUID, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] chunk, _, complete, error in
            guard let self, self.connections[id] != nil else { return }
            var data = buffer
            if let chunk { data.append(chunk) }
            guard data.count <= self.limit + 8192 else { self.respond(connection, id, 413); return }
            if let separator = data.range(of: Data("\r\n\r\n".utf8)) {
                guard separator.lowerBound <= 8192,
                      let head = String(data: data[..<separator.lowerBound], encoding: .utf8) else {
                    self.respond(connection, id, 400); return
                }
                let lines = head.components(separatedBy: "\r\n")
                let request = lines[0].split(separator: " ")
                var headers: [String: String] = [:]
                for line in lines.dropFirst() {
                    guard let colon = line.firstIndex(of: ":") else { self.respond(connection, id, 400); return }
                    let key = line[..<colon].lowercased()
                    guard headers[key] == nil else { self.respond(connection, id, 400); return }
                    headers[key] = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
                }
                guard request.count == 3, headers["host"] == "127.0.0.1:\(Self.port)",
                      let origin = headers["origin"], self.origins.contains(origin) else {
                    self.respond(connection, id, 403); return
                }
                guard headers["transfer-encoding"] == nil,
                      let length = Int(headers["content-length"] ?? "0"), length >= 0, length <= self.limit else {
                    self.respond(connection, id, 413, origin: origin); return
                }
                let method = String(request[0]), path = String(request[1])
                if method == "OPTIONS", ["/session", "/copy"].contains(path) {
                    self.respond(connection, id, 204, origin: origin); return
                }
                if method == "GET", path == "/session" {
                    self.respond(connection, id, 200, origin: origin, body: ["service": "jjalkkak", "version": 1, "token": self.token]); return
                }
                guard method == "POST", path == "/copy", headers["x-jjalkkak-session"] == self.token,
                      headers["content-type"] == "image/gif", length > 0 else {
                    self.respond(connection, id, 403, origin: origin); return
                }
                let body = Data(data[separator.upperBound...])
                if body.count >= length {
                    guard body.count == length else { self.respond(connection, id, 400, origin: origin); return }
                    do {
                        let frames = try self.copy(body)
                        self.respond(connection, id, 200, origin: origin, body: ["copied": true, "frames": frames])
                    } catch { self.respond(connection, id, 422, origin: origin) }
                    return
                }
            } else if data.count > 8192 { self.respond(connection, id, 400); return }
            guard !complete, error == nil else {
                self.connections.removeValue(forKey: id)?.cancel(); return
            }
            self.receive(connection, id: id, buffer: data)
        }
    }

    private func copy(_ data: Data) throws -> Int {
        guard ["GIF87a", "GIF89a"].contains(String(decoding: data.prefix(6), as: UTF8.self)),
              let source = CGImageSourceCreateWithData(data as CFData, nil),
              CGImageSourceGetStatus(source) == .statusComplete,
              CGImageSourceGetCount(source) > 0 else { throw CocoaError(.fileReadCorruptFile) }
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let file = folder.appendingPathComponent(UUID().uuidString).appendingPathExtension("gif")
        try data.write(to: file, options: .atomic)
        // A file URL preserves every animation frame for native paste targets.
        let board = NSPasteboard.general
        board.clearContents()
        guard board.writeObjects([file as NSURL]) else { throw CocoaError(.fileWriteUnknown) }
        return CGImageSourceGetCount(source)
    }

    private func respond(_ connection: NWConnection, _ id: UUID, _ code: Int, origin: String? = nil,
                         body: [String: Any] = [:]) {
        let payload = code == 204 ? Data() : ((try? JSONSerialization.data(withJSONObject: body)) ?? Data())
        var header = "HTTP/1.1 \(code) Response\r\nContent-Type: application/json\r\nContent-Length: \(payload.count)\r\nConnection: close\r\nCache-Control: no-store\r\n"
        if let origin {
            header += "Access-Control-Allow-Origin: \(origin)\r\nVary: Origin\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type, X-Jjalkkak-Session\r\nAccess-Control-Allow-Private-Network: true\r\n"
        }
        connection.send(content: Data((header + "\r\n").utf8) + payload, completion: .contentProcessed { [weak self] _ in
            self?.connections.removeValue(forKey: id)?.cancel()
        })
    }
}
