import ExpoModulesCore
import UniformTypeIdentifiers

/**
 * The iOS half of the backup documents. File providers in the Files app (iCloud Drive, Google Drive,
 * OneDrive) grant a folder, so the user picks one and both files are written inside it. Access after
 * a restart needs the folder's security-scoped bookmark resolved and opened around every write, which
 * the picker package does not expose, hence this module.
 */
public class CreateDocumentModule: Module {
  private var picker: FolderPicker?

  public func definition() -> ModuleDefinition {
    Name("CreateDocument")

    // Resolves the folder's bookmark (base64), or null if cancelled.
    AsyncFunction("pickFolder") { (promise: Promise) in
      if self.picker != nil { throw Exception(name: "E_BUSY", description: "Folder dialog already open") }
      guard let host = self.appContext?.utilities?.currentViewController() else {
        throw Exception(name: "E_NO_VIEW", description: "Nothing to show the folder dialog from")
      }
      let controller = UIDocumentPickerViewController(forOpeningContentTypes: [.folder])
      let picker = FolderPicker { bookmark, error in
        self.picker = nil
        if let error { promise.reject("E_NOT_PERSISTABLE", error) } else { promise.resolve(bookmark) }
      }
      controller.delegate = picker
      self.picker = picker
      host.present(controller, animated: true)
    }.runOnQueue(.main)

    // Replace `name` inside the bookmarked folder whole; atomic, so a shorter file leaves no stale bytes.
    AsyncFunction("write") { (bookmark: String, name: String, content: String) in
      guard let data = Data(base64Encoded: bookmark) else {
        throw Exception(name: "E_BOOKMARK", description: "Damaged backup folder bookmark. Choose the folder again.")
      }
      var stale = false
      let folder = try URL(resolvingBookmarkData: data, bookmarkDataIsStale: &stale)
      guard folder.startAccessingSecurityScopedResource() else {
        throw Exception(name: "E_ACCESS", description: "Lost access to the backup folder. Choose it again.")
      }
      defer { folder.stopAccessingSecurityScopedResource() }
      try Data(content.utf8).write(to: folder.appendingPathComponent(name), options: .atomic)
    }
  }
}

private class FolderPicker: NSObject, UIDocumentPickerDelegate {
  private let done: (String?, String?) -> Void   // (bookmark, error message); both nil when cancelled
  init(done: @escaping (String?, String?) -> Void) { self.done = done }

  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    guard let url = urls.first else { return done(nil, nil) }
    let refused = "This folder cannot keep a backup file. Choose another."
    guard url.startAccessingSecurityScopedResource() else { return done(nil, refused) }
    defer { url.stopAccessingSecurityScopedResource() }
    do { done(try url.bookmarkData().base64EncodedString(), nil) } catch { done(nil, refused) }
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { done(nil, nil) }
}
