"""Open Food Facts OCR JSON (Google Vision) to the label-text module's output: [{text, x, y, w, h}], normalized 0..1, y down.
Usage: python3 scripts/off-ocr-fixture.py <gtin13> <imgid>   writes fixtures/labels/<gtin13>.json"""
import json, sys, urllib.request

code, imgid = sys.argv[1], sys.argv[2]
path = f'{code[:3]}/{code[3:6]}/{code[6:9]}/{code[9:]}' if len(code) > 8 else code
req = urllib.request.Request(f'https://images.openfoodfacts.org/images/products/{path}/{imgid}.json',
                             headers={'User-Agent': 'CalorieTracker/1.0 (github.com/codejetnet/calorie-tracker)'})
r = json.load(urllib.request.urlopen(req))['responses'][0]
page = r['fullTextAnnotation']['pages'][0]
W, H = page['width'], page['height']
out = []
for block in page['blocks']:
    for para in block['paragraphs']:
        line = []   # a Vision paragraph can span several label rows; split it where Vision saw a line break
        for w in para['words']:
            line.append(w)
            brk = (w['symbols'][-1].get('property', {}).get('detectedBreak') or {}).get('type')
            if brk in ('EOL_SURE_SPACE', 'LINE_BREAK') or w is para['words'][-1]:
                text = ' '.join(''.join(s['text'] for s in x['symbols']) for x in line)
                xs = [v.get('x', 0) for x in line for v in x['boundingBox']['vertices']]
                ys = [v.get('y', 0) for x in line for v in x['boundingBox']['vertices']]
                out.append({'text': text, 'x': min(xs) / W, 'y': min(ys) / H, 'w': (max(xs) - min(xs)) / W, 'h': (max(ys) - min(ys)) / H})
                line = []
json.dump(out, open(f'fixtures/labels/{code}.json', 'w'), indent=1)
print(len(out), 'fragments')
