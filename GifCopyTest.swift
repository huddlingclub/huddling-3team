import AppKit
import ImageIO

private let gifType = NSPasteboard.PasteboardType("com.compuserve.gif")

private enum CopyMode: String {
    case gifBytes = "A. 원본 GIF 복사"
    case fileURL = "B. GIF 파일 복사"

    @MainActor
    func copy(_ fixture: URL, to pasteboard: NSPasteboard) throws {
        let object: any NSPasteboardWriting
        switch self {
        case .gifBytes:
            let bytes = try Data(contentsOf: fixture)
            let item = NSPasteboardItem()
            guard item.setData(bytes, forType: gifType) else {
                throw CocoaError(.fileWriteUnknown)
            }
            object = item
        case .fileURL:
            guard FileManager.default.isReadableFile(atPath: fixture.path) else {
                throw CocoaError(.fileReadNoSuchFile)
            }
            object = fixture as NSURL
        }

        pasteboard.clearContents()
        guard pasteboard.writeObjects([object]) else {
            throw CocoaError(.fileWriteUnknown)
        }
    }
}

@MainActor
private final class CopyTestWindow: NSWindowController {
    private let fixture: URL
    private let status = NSTextField(wrappingLabelWithString: "복사 방식을 선택하세요.")

    init(fixture: URL) {
        self.fixture = fixture
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 460, height: 166),
            styleMask: [.titled, .closable, .miniaturizable],
            backing: .buffered, defer: false
        )
        super.init(window: window)

        window.title = "카카오톡 GIF 붙여넣기 테스트"
        window.center()

        let rawButton = NSButton(title: CopyMode.gifBytes.rawValue, target: self, action: #selector(copyBytes))
        let fileButton = NSButton(title: CopyMode.fileURL.rawValue, target: self, action: #selector(copyFile))
        let buttons = NSStackView(views: [rawButton, fileButton])
        let instructions = NSTextField(labelWithString: "숫자 1 → 2 → 3이 반복되는 같은 GIF를 두 방식으로 복사합니다.")
        status.textColor = .secondaryLabelColor
        let content = NSStackView(views: [instructions, buttons, status])
        content.orientation = .vertical
        content.alignment = .leading
        content.spacing = 14
        content.edgeInsets = NSEdgeInsets(top: 22, left: 24, bottom: 22, right: 24)
        window.contentView = content
        status.widthAnchor.constraint(equalTo: content.widthAnchor, constant: -48).isActive = true
    }

    required init?(coder: NSCoder) { nil }

    @objc private func copyBytes() { copy(.gifBytes) }
    @objc private func copyFile() { copy(.fileURL) }

    private func copy(_ mode: CopyMode) {
        do {
            try mode.copy(fixture, to: .general)
            status.stringValue = "\(mode.rawValue) 완료. 카카오톡에서 ⌘V로 붙여넣으세요."
        } catch {
            status.stringValue = "복사 실패. \(error.localizedDescription)"
        }
    }
}

@MainActor
private final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }
}

@main
private enum Launcher {
    @MainActor
    static func main() throws {
        var arguments = Array(CommandLine.arguments.dropFirst())
        let checkOnly = arguments.last == "--check"
        if checkOnly { arguments.removeLast() }

        let fixture = arguments.first.map { URL(fileURLWithPath: $0) }
            ?? Bundle.main.url(forResource: "123", withExtension: "gif")
        guard let fixture else {
            throw CocoaError(.fileReadNoSuchFile)
        }
        if checkOnly {
            try checkCopies(fixture)
            return
        }

        let app = NSApplication.shared
        let delegate = AppDelegate()
        let window = CopyTestWindow(fixture: fixture)
        app.delegate = delegate
        app.setActivationPolicy(.regular)
        window.showWindow(nil)
        app.activate(ignoringOtherApps: true)
        withExtendedLifetime((delegate, window)) { app.run() }
    }

    @MainActor
    private static func checkCopies(_ fixture: URL) throws {
        let bytes = try Data(contentsOf: fixture)
        guard let image = CGImageSourceCreateWithData(bytes as CFData, nil),
              CGImageSourceGetCount(image) == 3 else {
            throw CocoaError(.fileReadCorruptFile)
        }

        let pasteboard = NSPasteboard.withUniqueName()
        defer { pasteboard.releaseGlobally() }

        try CopyMode.gifBytes.copy(fixture, to: pasteboard)
        guard pasteboard.data(forType: gifType) == bytes,
              pasteboard.availableType(from: [.fileURL]) == nil else {
            throw CocoaError(.fileReadCorruptFile)
        }
        print("A 통과: 원본 GIF 바이트 일치")

        try CopyMode.fileURL.copy(fixture, to: pasteboard)
        let urls = pasteboard.readObjects(
            forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true]
        ) as? [URL]
        guard urls == [fixture], pasteboard.availableType(from: [gifType]) == nil else {
            throw CocoaError(.fileReadCorruptFile)
        }
        print("B 통과: 같은 GIF를 가리키는 파일 URL 확인")
    }
}
