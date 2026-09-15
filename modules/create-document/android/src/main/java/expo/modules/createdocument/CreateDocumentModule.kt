package expo.modules.createdocument

import android.app.Activity
import android.content.Intent
import android.net.Uri
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val CREATE_DOCUMENT_CODE = 7311

/**
 * ACTION_CREATE_DOCUMENT with a persistable grant on the result, which is what
 * `saveDocuments` from the picker package does not do (its grant dies at reboot).
 */
class CreateDocumentModule : Module() {
  private var pending: Promise? = null

  override fun definition() = ModuleDefinition {
    Name("CreateDocument")

    AsyncFunction("createDocument") { name: String, mime: String, promise: Promise ->
      if (pending != null) throw CodedException("Create-document dialog already open")
      val intent = Intent(Intent.ACTION_CREATE_DOCUMENT)
        .addCategory(Intent.CATEGORY_OPENABLE)
        .setType(mime)
        .putExtra(Intent.EXTRA_TITLE, name)
      pending = promise
      try {
        appContext.throwingActivity.startActivityForResult(intent, CREATE_DOCUMENT_CODE)
      } catch (e: Throwable) {
        pending = null
        throw e
      }
    }

    // "wt" truncates. expo-file-system opens SAF documents with "w", which some providers do not
    // truncate, so a shrinking diary.json would keep stale bytes past the new end and stop parsing.
    AsyncFunction("write") { uri: String, content: String ->
      val out = appContext.reactContext?.contentResolver?.openOutputStream(Uri.parse(uri), "wt")
        ?: throw CodedException("Cannot open $uri for writing")
      out.use { it.write(content.toByteArray(Charsets.UTF_8)) }
    }

    OnActivityResult { activity, (requestCode, resultCode, data) ->
      if (requestCode != CREATE_DOCUMENT_CODE) return@OnActivityResult
      val uri = if (resultCode == Activity.RESULT_OK) data?.data else null
      val promise = pending
      pending = null
      if (uri == null) {
        promise?.resolve(null)
        return@OnActivityResult
      }
      try {
        // The whole point of this module: without the persistable grant the write dies at the next reboot.
        activity.contentResolver.takePersistableUriPermission(
          uri, Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
        )
        promise?.resolve(uri.toString())
      } catch (e: SecurityException) {
        promise?.reject("E_NOT_PERSISTABLE", "This location cannot keep a backup file. Choose another.", e)
      }
    }
  }
}
