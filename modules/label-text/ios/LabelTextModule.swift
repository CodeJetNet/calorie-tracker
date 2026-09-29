import ExpoModulesCore
import ImageIO
import Vision

public class LabelTextModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LabelText")

    AsyncFunction("recognize") { (uri: URL, rotation: Int, promise: Promise) in
      guard let src = CGImageSourceCreateWithURL(uri as CFURL, nil), let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else {
        return promise.reject("E_IMAGE", "Could not read the photo")
      }
      let props = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [CFString: Any]
      let exifDeg: [UInt32: Int] = [1: 0, 6: 90, 3: 180, 8: 270]
      let deg = ((exifDeg[props?[kCGImagePropertyOrientation] as? UInt32 ?? 1] ?? 0) + rotation) % 360
      let orientation: CGImagePropertyOrientation = [0: .up, 90: .right, 180: .down, 270: .left][deg] ?? .up
      let req = VNRecognizeTextRequest { req, err in
        if let err { return promise.reject("E_OCR", err.localizedDescription) }
        promise.resolve((req.results as? [VNRecognizedTextObservation] ?? []).compactMap { o -> [String: Any]? in
          guard let t = o.topCandidates(1).first?.string else { return nil }
          let b = o.boundingBox   // normalized, origin bottom-left, in the oriented image
          return ["text": t, "x": b.minX, "y": 1 - b.maxY, "w": b.width, "h": b.height]
        })
      }
      req.recognitionLevel = .accurate
      req.usesLanguageCorrection = false   // "Og" must not become "Of"; the parser fixes digits itself
      DispatchQueue.global(qos: .userInitiated).async {
        do { try VNImageRequestHandler(cgImage: img, orientation: orientation, options: [:]).perform([req]) }
        catch { promise.reject("E_OCR", error.localizedDescription) }
      }
    }
  }
}
