import AppKit

guard CommandLine.arguments.count == 2 else { exit(1) }
let file = URL(fileURLWithPath: CommandLine.arguments[1])
guard FileManager.default.isReadableFile(atPath: file.path) else { exit(1) }

let pasteboard = NSPasteboard.general
pasteboard.declareTypes([.fileURL], owner: nil)
exit(pasteboard.setString(file.absoluteString, forType: .fileURL) ? 0 : 1)
