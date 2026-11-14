import AppKit
import Carbon
import ImageIO
import WebKit

private let shortcutSignature: OSType = 0x47464B59

private final class GifDownloadDelegate: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

private final class PickerWebView: WKWebView, NSDraggingSource {
    private var dragEvent: NSEvent?

    override func mouseDragged(with event: NSEvent) {
        dragEvent = event
        super.mouseDragged(with: event)
    }

    func dragFile(_ url: URL) -> Bool {
        guard NSEvent.pressedMouseButtons & 1 != 0, let event = dragEvent,
              ProcessInfo.processInfo.systemUptime - event.timestamp < 1 else { return false }
        dragEvent = nil
        let item = NSDraggingItem(pasteboardWriter: url as NSURL)
        let pointer = convert(event.locationInWindow, from: nil)
        let icon = NSWorkspace.shared.icon(forFile: url.path)
        item.setDraggingFrame(NSRect(x: pointer.x - 16, y: pointer.y - 16, width: 32, height: 32), contents: icon)
        beginDraggingSession(with: [item], event: event, source: self)
        return true
    }

    func draggingSession(_ session: NSDraggingSession, sourceOperationMaskFor context: NSDraggingContext) -> NSDragOperation {
        .copy
    }
}

private final class GifkeyApp: NSObject, NSApplicationDelegate, WKScriptMessageHandlerWithReply {
    private var window: NSWindow!
    private var webView: PickerWebView!
    private var menuItem: NSStatusItem?
    private var hotKey: EventHotKeyRef?
    private var hotKeyHandler: EventHandlerRef?
    private var previousApp: NSRunningApplication?
    private var ready = false
    private var isOpen = false
    private var sessionID = 0
    private var externalCopy: Task<Void, Never>?
    private var transferFolder: URL?
    private lazy var downloads = URLSession(configuration: .ephemeral, delegate: GifDownloadDelegate(), delegateQueue: nil)

    private let bridge = """
    (() => {
      const listeners = {};
      window.__gifkeyEvent = (event, value) => listeners[event]?.(value);
      const on = (event, callback) => {
        listeners[event] = callback;
        return () => { delete listeners[event]; };
      };
      const send = (action, request = {}) =>
        window.webkit.messageHandlers.gifkey.postMessage({ action, ...request });
      window.gifHost = {
        onOpen: callback => on('open', callback),
        onClose: callback => on('close', callback),
        onShortcutError: callback => on('shortcut-error', callback),
        ready: () => send('ready'),
        close: () => send('close'),
        copyGif: request => send('copy', request),
        dragGif: request => send('drag', request)
      };
    })();
    """

    func applicationDidFinishLaunching(_ notification: Notification) {
        let page = Bundle.main.resourceURL!.appendingPathComponent("picker/index.html")
        let config = WKWebViewConfiguration()
        config.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "gifkey")
        config.userContentController.addUserScript(WKUserScript(source: bridge, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        webView = PickerWebView(frame: .zero, configuration: config)

        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 520, height: 512),
                          styleMask: [.titled, .closable, .fullSizeContentView],
                          backing: .buffered, defer: false)
        window.title = "짤깍"
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.standardWindowButton(.closeButton)?.isHidden = true
        window.isMovableByWindowBackground = true
        window.level = .floating
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        window.backgroundColor = NSColor(red: 0.10, green: 0.10, blue: 0.12, alpha: 1)
        window.contentView = webView

        let menu = NSMenu()
        let openItem = menu.addItem(withTitle: "짤깍 열기", action: #selector(showPicker), keyEquivalent: "")
        openItem.target = self
        menu.addItem(.separator())
        menu.addItem(withTitle: "짤깍 종료", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        menuItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        menuItem?.button?.image = NSImage(systemSymbolName: "bolt.fill", accessibilityDescription: "짤깍")
        menuItem?.button?.toolTip = "짤깍"
        menuItem?.menu = menu

        // Standard edit shortcuts work inside the WebKit search and message fields.
        let edit = NSMenu(title: "편집")
        edit.addItem(withTitle: "잘라내기", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "복사", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "붙여넣기", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "모두 선택", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        let mainMenu = NSMenu()
        let editMenuItem = mainMenu.addItem(withTitle: "편집", action: nil, keyEquivalent: "")
        mainMenu.setSubmenu(edit, for: editMenuItem)
        NSApp.mainMenu = mainMenu

        registerShortcut()
        webView.loadFileURL(page, allowingReadAccessTo: page.deletingLastPathComponent())
    }

    private func registerShortcut() {
        var type = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        let owner = Unmanaged.passUnretained(self).toOpaque()
        let status = InstallEventHandler(GetEventDispatcherTarget(), { _, event, owner in
            guard let event, let owner else { return OSStatus(eventNotHandledErr) }
            var id = EventHotKeyID()
            let result = GetEventParameter(event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID),
                                           nil, MemoryLayout<EventHotKeyID>.size, nil, &id)
            guard result == noErr, id.signature == shortcutSignature else { return OSStatus(eventNotHandledErr) }
            let app = Unmanaged<GifkeyApp>.fromOpaque(owner).takeUnretainedValue()
            DispatchQueue.main.async { app.togglePicker() }
            return noErr
        }, 1, &type, owner, &hotKeyHandler)
        guard status == noErr else { return }
        RegisterEventHotKey(UInt32(kVK_Space), UInt32(optionKey),
                            EventHotKeyID(signature: shortcutSignature, id: 1),
                            GetEventDispatcherTarget(), 0, &hotKey)
    }

    private func togglePicker() {
        if isOpen { hidePicker() }
        else { showPicker() }
    }

    @objc private func showPicker() {
        guard ready, !isOpen, externalCopy == nil else { return }
        let active = NSWorkspace.shared.frontmostApplication
        previousApp = active?.processIdentifier == ProcessInfo.processInfo.processIdentifier ? nil : active
        let screen = NSScreen.screens.first { $0.frame.contains(NSEvent.mouseLocation) } ?? NSScreen.main
        if let area = screen?.visibleFrame {
            window.setFrameOrigin(NSPoint(x: area.midX - window.frame.width / 2,
                                          y: area.maxY - window.frame.height - max(0, (area.height - window.frame.height) * 0.24)))
        }
        isOpen = true
        sessionID += 1
        NSApp.activate(ignoringOtherApps: true)
        window.makeKeyAndOrderFront(nil)
        window.makeFirstResponder(webView)
        webView.evaluateJavaScript("window.__gifkeyEvent('open', \(sessionID))")
        if hotKey == nil { webView.evaluateJavaScript("window.__gifkeyEvent('shortcut-error')") }
    }

    private func hidePicker() {
        guard isOpen else { return }
        isOpen = false
        webView.evaluateJavaScript("window.__gifkeyEvent('close')")
        window.orderOut(nil)
        previousApp?.activate(options: [])
        previousApp = nil
    }

    func application(_ application: NSApplication, open urls: [URL]) {
        guard let url = urls.first,
              let target = URLComponents(url: url, resolvingAgainstBaseURL: false),
              target.scheme == "jjalkkak-copy", target.host == "gif",
              let source = target.queryItems?.first(where: { $0.name == "source" })?.value else { return }
        externalCopy?.cancel()
        hidePicker()
        externalCopy = Task { @MainActor in
            defer { if !Task.isCancelled { externalCopy = nil } }
            do {
                let file = try await originalGif(source)
                try Task.checkCancellation()
                guard copyFile(file) else { throw CocoaError(.fileWriteUnknown) }
            } catch {
                guard !Task.isCancelled else { return }
                let alert = NSAlert()
                alert.messageText = "GIF를 복사하지 못했어요."
                alert.informativeText = "원본 GIF에 연결할 수 있는지 확인한 뒤 다시 시도해 주세요."
                NSApp.activate(ignoringOtherApps: true)
                alert.runModal()
            }
        }
    }

    private func sampleFile(_ source: String) -> URL? {
        guard source.range(of: #"^/fixtures/[a-z]+\.gif$"#, options: .regularExpression) != nil else { return nil }
        return Bundle.main.resourceURL?.appendingPathComponent("picker" + source)
    }

    private func originalGif(_ source: String) async throws -> URL {
        if let sample = sampleFile(source), FileManager.default.isReadableFile(atPath: sample.path) {
            return sample
        }
        guard source.count <= 8192, let url = URL(string: source), url.scheme == "https",
              let host = url.host, host.range(of: #"^static[0-9]*\.klipy\.com$"#, options: .regularExpression) != nil,
              url.user == nil, url.password == nil, url.port == nil else { throw URLError(.unsupportedURL) }
        let maximumBytes = 24 * 1024 * 1024
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15)
        request.setValue("image/gif", forHTTPHeaderField: "Accept")
        let (stream, response) = try await downloads.bytes(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200,
              response.expectedContentLength <= Int64(maximumBytes) else { throw URLError(.badServerResponse) }

        var data = Data()
        for try await byte in stream {
            guard data.count < maximumBytes else { throw URLError(.dataLengthExceedsMaximum) }
            data.append(byte)
        }
        guard ["GIF87a", "GIF89a"].contains(String(decoding: data.prefix(6), as: UTF8.self)),
              let image = CGImageSourceCreateWithData(data as CFData, nil), CGImageSourceGetCount(image) > 0
        else { throw CocoaError(.fileReadCorruptFile) }
        let folder = transferFolder ?? FileManager.default.temporaryDirectory.appendingPathComponent("jjalkkak-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        transferFolder = folder
        let file = folder.appendingPathComponent(UUID().uuidString).appendingPathExtension("gif")
        try data.write(to: file, options: .atomic)
        return file
    }

    private func copyFile(_ file: URL) -> Bool {
        let board = NSPasteboard.general
        board.declareTypes([.fileURL], owner: nil)
        return board.setString(file.absoluteString, forType: .fileURL)
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        guard message.frameInfo.isMainFrame, message.frameInfo.request.url?.isFileURL == true,
              let data = message.body as? [String: Any], let action = data["action"] as? String else {
            replyHandler(false, nil)
            return
        }
        if action == "ready" {
            ready = true
            showPicker()
            replyHandler(true, nil)
            return
        }
        if action == "close" {
            hidePicker()
            replyHandler(true, nil)
            return
        }

        guard isOpen, data["sessionId"] as? Int == sessionID,
              let id = data["id"] as? String, id.range(of: "^[a-z]+$", options: .regularExpression) != nil,
              data["gifUrl"] as? String == "/fixtures/\(id).gif",
              let file = Bundle.main.url(forResource: id, withExtension: "gif", subdirectory: "picker/fixtures") else {
            replyHandler(false, nil)
            return
        }

        switch action {
        case "drag":
            replyHandler(webView.dragFile(file), nil)
        case "copy":
            let copied = copyFile(file)
            replyHandler(copied, nil)
            if copied { hidePicker() }
        default:
            replyHandler(false, nil)
        }
    }
}

let app = NSApplication.shared
private let delegate = GifkeyApp()
app.delegate = delegate
app.setActivationPolicy(.accessory)
withExtendedLifetime(delegate) { app.run() }
