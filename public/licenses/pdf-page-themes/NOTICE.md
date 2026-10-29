# PDF page themes

Blender and Color are vendored from https://github.com/zotero/pdf.js/tree/5f95f712bc629ac11159cb4859ed8091fdffa87b/src/display/blender (fixed revision 5f95f712bc629ac11159cb4859ed8091fdffa87b). The source repository is licensed under Apache-2.0. Color identifies its Doq/Color.js MIT provenance; both license texts are included. MathClamp is from the same revision's src/shared/math_clamp.js, with its Mozilla copyright header preserved.

Paperpane changes: local module import paths only in the vendored files. The adapter registers themes per viewer/page canvas using WeakMaps instead of Zotero's window.theme. PDF.js lifecycle, transparency-group and pattern hooks are adapted from that revision's src/display/canvas.js to pdfjs-dist 6.4.299. The original source coloring algorithms are not rewritten.

Original PDF bytes, exports, annotation colors and unregistered canvases are not modified by this adapter. Theme selection affects display rendering only.
