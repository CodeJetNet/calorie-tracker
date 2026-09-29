package expo.modules.labeltext

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.InputStream

class LabelTextModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LabelText")

    AsyncFunction("recognize") { uri: String, rotation: Int, promise: Promise ->
      val resolver = appContext.reactContext?.contentResolver ?: throw CodedException("No context")
      val u = Uri.parse(uri)
      fun <T> read(block: (InputStream) -> T): T =
        (resolver.openInputStream(u) ?: throw CodedException("Could not open the photo")).use(block)
      val exif = read { ExifInterface(it).rotationDegrees }
      val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      read { BitmapFactory.decodeStream(it, null, bounds) }
      // A 12 MP photo is ~48 MB as a bitmap; ML Kit needs nothing near that for a label.
      var sample = 1
      while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= 2000) sample *= 2
      val bmp = read { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) }
        ?: throw CodedException("Could not read the photo")
      val up = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, Matrix().apply { postRotate(((exif + rotation) % 360).toFloat()) }, true)
      TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS).process(InputImage.fromBitmap(up, 0))
        .addOnSuccessListener { text ->
          val w = up.width.toDouble(); val h = up.height.toDouble()
          promise.resolve(text.textBlocks.flatMap { it.lines }.mapNotNull { l ->
            l.boundingBox?.let { b -> mapOf("text" to l.text, "x" to b.left / w, "y" to b.top / h, "w" to b.width() / w, "h" to b.height() / h) }
          })
        }
        .addOnFailureListener { promise.reject(CodedException(it.message ?: "Text recognition failed", it)) }
    }
  }
}
