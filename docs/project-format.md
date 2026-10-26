# صيغ الملفات — Cylio Studio

> الإصدار 1.0 — أكتوبر 2026

## ملف المشروع (`*.cylio.json`)

```json
{
  "format": "cylio-project", "version": "1.0", "rig": "cylio-r6",
  "meta": { "id": "proj_…", "name": "…", "createdAt": "ISO", "updatedAt": "ISO", "app": "Cylio Studio 1.0.0" },
  "shape": {
    "parts": { "head": { "w": 0.43, "d": 0.43, "h": 0.44, "round": 0.32 }, "torso": {…}, "leftArm": {…}, "rightArm": {…}, "leftLeg": {…}, "rightLeg": {…} },
    "layout": { "neckGap": 0.005, "shoulderGap": 0.006, "shoulderDrop": 0, "hipGap": 0.006, "legSpread": 0.036 }
  },
  "appearance": {
    "parts": { "head": { "color": "#1D5E66", "material": "satin", "roughness?": 0.5, "metalness?": 0, "scale?": 1 }, … },
    "face": { "visible": true, "eyeColor": "#FFFFFF", "eyeSize": 0.15, "eyeSpacing": 0.36, "eyeHeight": 0.6, "glow": 0.8,
              "mouth": "smile|grin|flat|none", "mouthColor": "#101214", "mouthWidth": 0.22, "mouthHeight": 0.36, "mouthCurve": 0.5, "mouthThickness": 0.009 }
  },
  "pose": { "root": { "rot": [0,0,0], "pos": [0,0,0] }, "torso": { "rot": [0,0,0] }, … },
  "animations": [ clip, … ],
  "locomotion": { "idle": "builtin_idle", "walk": "…", "run": "…", "jump": "…", "fall": "…", "land": "…" }
}
```

الوحدات: المتر للأبعاد، الدرجات للدوران، الثانية للزمن. `material`: `matte | satin | gloss | metal | galaxy`.

## الحركة (clip)

```json
{
  "id": "anim_…", "name": "المشي", "duration": 0.8, "loop": true, "fps": 30,
  "moveSpeed": null, "refLeg": 0.48, "role?": "walk",
  "tracks": {
    "leftLeg": [ { "t": 0, "rot": [-30, 0, 0], "ease": "linear" }, { "t": 0.4, "rot": [30, 0, 0], "ease": "linear" } ],
    "root":    [ { "t": 0, "rot": [0,0,0], "pos": [0, -0.0643, 0], "ease": "easeOut" } ]
  }
}
```

- `ease` يحدد شكل الانتقال من هذا الإطار إلى التالي: `linear | smooth | easeIn | easeOut | step`.
- الحركة المتكررة تنتقل من آخر إطار إلى الأول بسلاسة.
- `moveSpeed: null` يعني أن سرعة الانتقال تُحسب من تأرجح الرجلين.

ملف حركة منفرد (`*.cylio-anim.json`): `{ "format": "cylio-animation", "version": "1.0", "rig": "cylio-r6", "animation": clip }`.

## التحقق عند الفتح

`cleanProject()` لا يرمي أخطاء ولا ينفذ أي محتوى: يرفض الملف إن كان `format` أو الإصدار الرئيسي غير صحيح، ويصحّح كل قيمة أخرى (حدود، ألوان، مفاصل غير معروفة) مع قائمة تحذيرات تظهر للمستخدم.

## GLB

- عقد مسمّاة: `root › torso › head, leftArm, rightArm, leftLeg, rightLeg`، وتحت كل مفصل شبكة `part_<id>`.
- كل حركة تُخبز إلى glTF animation بعينات 30 إطاراً/ث: دوران كل مفصل كواترنيون، وموضع الجذر.
- عناصر المحرّر (حدود التحديد، توهّج العينين) لا تُصدَّر.
