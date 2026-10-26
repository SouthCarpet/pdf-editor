# Third-party notices

PDF Editor source is licensed under AGPL-3.0-or-later (see [LICENSE](LICENSE)).
Third-party components keep their own licences. This inventory describes the
per-user setup payload in [packaging/payload.json](packaging/payload.json).
It does not add files to the installer. This document is not a completed
source or notice bundle.

## Programs and OCR resources

| Component | Delivery | Licence and licence text | Source / evidence |
|---|---|---|---|
| qpdf 12.3.2 | Installer: qpdf.exe, qpdf30.dll | [Apache-2.0](https://github.com/qpdf/qpdf/blob/v12.3.2/LICENSE.txt) | [Source](https://github.com/qpdf/qpdf/tree/v12.3.2) |
| Ghostscript 10.07.0 | Installer: gswin64c.exe, gsdll64.dll | [AGPL-3.0](LICENSE) | [Source and releases](https://www.ghostscript.com/releases/) |
| MuPDF 1.27.0 | Installer: mutool.exe | [AGPL-3.0](https://github.com/ArtifexSoftware/mupdf/blob/1.27.0/COPYING) | [Source](https://github.com/ArtifexSoftware/mupdf/tree/1.27.0), including its third-party library notices |
| Tesseract 5.4.0.20240606 | Installer: tesseract.exe, libtesseract-5.dll | [Apache-2.0](https://github.com/tesseract-ocr/tesseract/blob/5.4.0/LICENSE) | [Windows build](https://github.com/UB-Mannheim/tesseract/releases/tag/v5.4.0.20240606) |
| PDFCrack 0.19 | Installer: pdfcrack.exe | [GPL-2.0-or-later](https://github.com/alitrack/PDFCrack/blob/0.19/COPYING) | [Windows source 0.19 and grant](https://github.com/alitrack/PDFCrack/blob/0.19/pdfcrack.c#L7-L8) |
| Tesseract tessdata_best: ces, deu, eng, pol, slk | Installer: five .traineddata files | [Apache-2.0](https://github.com/tesseract-ocr/tessdata_best/blob/main/LICENSE) | [Model source](https://github.com/tesseract-ocr/tessdata_best), [Polish model provenance](src-tauri/resources/ocr/PROVENANCE.md#tesseract-polish-language-data) |
| RapidAI PP-OCRv5 detection and Latin recognition models, dictionary | Installer: two ONNX files and ppocrv5_latin_dict.txt | [Apache-2.0](src-tauri/resources/ocr/LICENSE-RapidOCR-APACHE-2.0.txt) | [Pinned provenance and hashes](src-tauri/resources/ocr/PROVENANCE.md#rapidocr-pp-ocrv5-models) |
| ONNX Runtime 1.22.1 | Installer: resources/ocr/onnxruntime.dll; header used at build time | [MIT](src-tauri/resources/ocr/LICENSE-ONNXRUNTIME-MIT.txt) | [Provenance](src-tauri/resources/ocr/PROVENANCE.md#onnx-runtime) |
| LibreOffice | User installs it; not in payload | [MPL-2.0, with other component licences](https://www.libreoffice.org/licenses/) | Installed LibreOffice LICENSE files and Help > License Information; [source](https://www.libreoffice.org/download/download-libreoffice/) |
| Microsoft WebView2 | System prerequisite; setup offers the Microsoft bootstrapper after consent | [Microsoft WebView2 terms](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution#the-evergreen-runtime-distribution-mode) (proprietary) | Not embedded in the 80-file payload |

PDFCrack 0.19's [pdfcrack.c, lines 7 to 8](https://github.com/alitrack/PDFCrack/blob/0.19/pdfcrack.c#L7-L8) grants:
> as published by the Free Software Foundation; either version 2
> of the License, or (at your option) any later version.

## Sidecar DLL inventory

All 61 entries below ship under `sidecars/`. Every row names its licence.
For four DLLs the exact upstream build is not identified; their licence is
the same in every release of their project (see "Licence identity without an
exact build" below). This inventory does not claim that a complete corresponding-source or notice
bundle has been delivered.

### Identification and licence evidence

The version resources below were read from each payload DLL on 2026-10-26
with `(Get-Item src-tauri/sidecars/<DLL>).VersionInfo`. An absent field is
recorded as `absent`; it is not replaced with a guessed version.
For DLLs without a resource, the table states the extra evidence used:
embedded strings, static version-return instructions, or an exact SHA-256
match with a named MSYS2 package. No DLL or installer was executed for this check.

All 51 Tesseract DLLs match byte for byte the files extracted from its
[5.4.0.20240606 upstream Windows archive](https://github.com/UB-Mannheim/tesseract/releases/tag/v5.4.0.20240606).
That archive has only Tesseract's licence in `doc/LICENSE`; it does not
supply a licence inventory for its dependencies. The seven exact MSYS2
matches use the packages named in the table from the
[MSYS2 package archive](https://repo.msys2.org/mingw/mingw64/).
Their `.PKGINFO` records the version and upstream, and their DLL hashes
match the installed rows below. Licence links target that upstream version.
Archive links identify `LICENSE` or `COPYING` inside that exact source
archive (bzip2: `LICENSE`; giflib: `COPYING`; libiconv: `COPYING.LIB`;
gettext: `gettext-runtime/intl/COPYING.LIB`; JBIG-KIT: `COPYING`).

The Brotli decoder returns `0x01001000` (1.1.0). Its common DLL has no
version export and the available newer package does not match, so its exact
build is not identified. WebP decoder, encoder and mux version functions return
`0x010400` (1.4.0); SharpYUV returns `0x000400` (0.4.0).
Leptonica's static `getLeptonicaVersion` call passes 1, 84 and 1.
ICU's data and i18n DLLs are paired with the 75.1 common DLL in the same
upstream archive; their exact build revision is not separately encoded.
FreeType is used under its FTL option: this software is based in part on
the work of the FreeType Team. Portions are copyright 2000-2023 The FreeType
Project. GCC's runtime exception text accompanies the GPL text linked in
[the same 14.1.0 source](https://github.com/gcc-mirror/gcc/blob/releases/gcc-14.1.0/COPYING3).

Microsoft's eight DLLs identify Visual C++ 14.44.35211.0. They are byte for
byte the files in `bin/` of the official
[qpdf 12.3.2 `qpdf-12.3.2-msvc64.zip`](https://github.com/qpdf/qpdf/releases/tag/v12.3.2)
(SHA-256 compared on 2026-10-26, together with `qpdf30.dll`). The app ships
them unmodified next to `qpdf.exe`, as qpdf ships them. This is the local
deployment that Microsoft documents in
[Deployment in Microsoft C++](https://learn.microsoft.com/en-us/cpp/windows/deployment-in-visual-cpp#local-deployment).
The Visual C++ runtime files are on the Visual Studio 2022
[Distributable Code list](https://learn.microsoft.com/en-us/visualstudio/releases/2022/redistribution#visual-c-runtime-files);
their terms are proprietary.

| Installed DLL | Upstream and version evidence | Licence / licence text |
|---|---|---|
| concrt140.dll | Microsoft Visual C++ 14.44.35211.0 (version resource) | [Proprietary Microsoft runtime terms](https://visualstudio.microsoft.com/license-terms/vs2022-cruntime/) |
| gsdll64.dll | Ghostscript 10.07.0 (version resource) | [AGPL-3.0](https://github.com/ArtifexSoftware/ghostpdl/blob/ghostpdl-10.07.0/doc/COPYING) |
| libLerc.dll | Lerc 4.0.0-1 (exact MSYS2 package hash) | [Apache-2.0](https://github.com/Esri/lerc/blob/v4.0.0/LICENSE) |
| libarchive-13.dll | libarchive 3.7.4 (embedded software string) | [BSD-2-Clause and component terms](https://github.com/libarchive/libarchive/blob/v3.7.4/COPYING) |
| libb2-1.dll | libb2 0.98.1-2 (exact MSYS2 package hash) | [CC0-1.0](https://github.com/BLAKE2/libb2/blob/v0.98.1/COPYING) |
| libbrotlicommon.dll | Brotli common library; no version resource or version export; available 1.1.0-4 package hash differs | [MIT](https://github.com/google/brotli/blob/master/LICENSE) (exact build not identified; see below) |
| libbrotlidec.dll | Brotli 1.1.0 (BrotliDecoderVersion returns 0x01001000) | [MIT](https://github.com/google/brotli/blob/v1.1.0/LICENSE) |
| libbz2-1.dll | bzip2 1.0.8 (embedded version string) | [bzip2-1.0.6 (unchanged licence in 1.0.8)](https://sourceware.org/pub/bzip2/bzip2-1.0.8.tar.gz) |
| libcairo-2.dll | Cairo 1.18.0 (embedded source paths and version string) | [LGPL-2.1 OR MPL-1.1](https://gitlab.freedesktop.org/cairo/cairo/-/blob/1.18.0/COPYING) |
| libcrypto-3-x64.dll | OpenSSL 3.3.1 (version resource) | [Apache-2.0](https://github.com/openssl/openssl/blob/openssl-3.3.1/LICENSE.txt) |
| libdatrie-1.dll | libdatrie 0.2.13-3 (exact MSYS2 package hash) | [LGPL-2.1-or-later](https://github.com/tlwg/libdatrie/blob/v0.2.13/COPYING) |
| libdeflate.dll | libdeflate; no version resource or identifying version string; 1.20-1 archive no longer available | [MIT](https://github.com/ebiggers/libdeflate/blob/master/COPYING) (exact build not identified; see below) |
| libexpat-1.dll | Expat 2.6.2 (embedded source paths) | [MIT](https://github.com/libexpat/libexpat/blob/R_2_6_2/expat/COPYING) |
| libffi-8.dll | libffi 3.4.6-1 (exact MSYS2 package hash) | [MIT](https://github.com/libffi/libffi/blob/v3.4.6/LICENSE) |
| libfontconfig-1.dll | Fontconfig 2.15.0 (embedded source paths) | [MIT and listed component terms](https://gitlab.freedesktop.org/fontconfig/fontconfig/-/blob/2.15.0/COPYING) |
| libfreetype-6.dll | FreeType 2.13.2 (version resource) | [FTL (selected option)](https://github.com/freetype/freetype/blob/VER-2-13-2/docs/FTL.TXT) |
| libfribidi-0.dll | FriBidi 1.0.14 (embedded version string) | [LGPL-2.1-or-later](https://github.com/fribidi/fribidi/blob/v1.0.14/COPYING) |
| libgcc_s_seh-1.dll | GCC runtime; compiler markers 13.2.0 and 14.1.0; 14.1.0-3 package no longer available | [GPL-3.0-or-later with the GCC Runtime Library Exception 3.1](https://github.com/gcc-mirror/gcc/blob/releases/gcc-14.1.0/COPYING.RUNTIME) (exact build not identified; see below) |
| libgif-7.dll | giflib 5.2.2-1 (exact MSYS2 package hash) | [MIT](https://repo.msys2.org/mingw/sources/mingw-w64-giflib-5.2.2-1.src.tar.zst) |
| libgio-2.0-0.dll | GLib 2.80.2 (version resource) | [LGPL-2.1-or-later](https://github.com/GNOME/glib/blob/2.80.2/LICENSES/LGPL-2.1-or-later.txt) |
| libglib-2.0-0.dll | GLib 2.80.2 (version resource) | [LGPL-2.1-or-later](https://github.com/GNOME/glib/blob/2.80.2/LICENSES/LGPL-2.1-or-later.txt) |
| libgmodule-2.0-0.dll | GLib 2.80.2 (version resource) | [LGPL-2.1-or-later](https://github.com/GNOME/glib/blob/2.80.2/LICENSES/LGPL-2.1-or-later.txt) |
| libgobject-2.0-0.dll | GLib 2.80.2 (version resource) | [LGPL-2.1-or-later](https://github.com/GNOME/glib/blob/2.80.2/LICENSES/LGPL-2.1-or-later.txt) |
| libgraphite2.dll | Graphite2 1.3.14-3 (exact MSYS2 package hash) | [LGPL-2.1-or-later (selected option)](https://github.com/silnrsi/graphite/blob/1.3.14/LICENSE) |
| libharfbuzz-0.dll | HarfBuzz 8.5.0 (embedded source paths and version string) | [MIT-Modern-Variant](https://github.com/harfbuzz/harfbuzz/blob/8.5.0/COPYING) |
| libiconv-2.dll | GNU libiconv 1.17 (version resource) | [LGPL-2.1-or-later](https://ftp.gnu.org/pub/gnu/libiconv/libiconv-1.17.tar.gz) |
| libicudt75.dll | ICU 75 data; paired with ICU 75.1 in the same Tesseract archive | [Unicode-3.0 and listed data notices](https://github.com/unicode-org/icu/blob/release-75-1/LICENSE) |
| libicuin75.dll | ICU 75 i18n; paired with ICU 75.1 in the same Tesseract archive | [Unicode-3.0 and listed data notices](https://github.com/unicode-org/icu/blob/release-75-1/LICENSE) |
| libicuuc75.dll | ICU 75.1 (embedded version string) | [Unicode-3.0 and listed data notices](https://github.com/unicode-org/icu/blob/release-75-1/LICENSE) |
| libintl-8.dll | GNU gettext libintl 0.22.5 (version resource) | [LGPL-2.1-or-later](https://ftp.gnu.org/pub/gnu/gettext/gettext-0.22.5.tar.xz) |
| libjbig-0.dll | JBIG-KIT 2.1 (embedded version/copyright string) | [GPL-2.0-or-later](https://www.cl.cam.ac.uk/~mgk25/jbigkit/download/jbigkit-2.1.tar.gz) |
| libjpeg-8.dll | libjpeg-turbo 3.0.3 (embedded version string) | [IJG with subsumed Zlib terms](https://github.com/libjpeg-turbo/libjpeg-turbo/blob/3.0.3/README.ijg) |
| libleptonica-6.dll | Leptonica 1.84.1 (static getLeptonicaVersion arguments: 1, 84, 1) | [BSD-2-Clause](https://github.com/DanBloomberg/leptonica/blob/1.84.1/leptonica-license.txt) |
| liblz4.dll | LZ4 1.9.4 (version resource) | [BSD-2-Clause](https://github.com/lz4/lz4/blob/v1.9.4/lib/LICENSE) |
| liblzma-5.dll | XZ Utils liblzma 5.6.2 (version resource) | [0BSD](https://github.com/tukaani-project/xz/blob/v5.6.2/COPYING.0BSD) |
| libopenjp2-7.dll | OpenJPEG 2.5.2 (embedded version string) | [BSD-2-Clause](https://github.com/uclouvain/openjpeg/blob/v2.5.2/LICENSE) |
| libpango-1.0-0.dll | Pango 1.52.2 (version resource) | [LGPL-2.0-or-later](https://github.com/GNOME/pango/blob/1.52.2/COPYING) |
| libpangocairo-1.0-0.dll | PangoCairo 1.52.2 (version resource) | [LGPL-2.0-or-later](https://github.com/GNOME/pango/blob/1.52.2/COPYING) |
| libpangoft2-1.0-0.dll | PangoFT2 1.52.2 (version resource) | [LGPL-2.0-or-later](https://github.com/GNOME/pango/blob/1.52.2/COPYING) |
| libpangowin32-1.0-0.dll | PangoWin32 1.52.2 (version resource) | [LGPL-2.0-or-later](https://github.com/GNOME/pango/blob/1.52.2/COPYING) |
| libpcre2-8-0.dll | PCRE2 10.43 (embedded version/date string) | [BSD-3-Clause with PCRE2 binary exception](https://github.com/PCRE2Project/pcre2/blob/pcre2-10.43/LICENCE) |
| libpixman-1-0.dll | Pixman 0.43.4 (embedded source paths and version string) | [MIT](https://gitlab.freedesktop.org/pixman/pixman/-/blob/pixman-0.43.4/COPYING) |
| libpng16-16.dll | libpng 1.6.43 (embedded version/copyright string) | [libpng-2.0](https://github.com/pnggroup/libpng/blob/v1.6.43/LICENSE) |
| libsharpyuv-0.dll | SharpYUV 0.4.0 (SharpYuvGetVersion returns 0x000400) | [BSD-3-Clause](https://github.com/webmproject/libwebp/blob/v1.4.0/COPYING) |
| libstdc++-6.dll | GCC libstdc++ 14.1.0 (embedded source paths) | [GPL-3.0-or-later WITH GCC-exception-3.1](https://github.com/gcc-mirror/gcc/blob/releases/gcc-14.1.0/COPYING.RUNTIME) |
| libtesseract-5.dll | Tesseract 5.4.0.20240606 (embedded version string and exact upstream installer hash) | [Apache-2.0](https://github.com/UB-Mannheim/tesseract/blob/v5.4.0.20240606/LICENSE) |
| libthai-0.dll | libthai 0.1.29-3 (exact MSYS2 package hash) | [LGPL-2.1-or-later](https://github.com/tlwg/libthai/blob/v0.1.29/COPYING) |
| libtiff-6.dll | LibTIFF 4.6.0 (embedded version/copyright string) | [libtiff](https://gitlab.com/libtiff/libtiff/-/blob/v4.6.0/LICENSE.md) |
| libwebp-7.dll | libwebp 1.4.0 (WebPGetDecoderVersion and WebPGetEncoderVersion return 0x010400) | [BSD-3-Clause](https://github.com/webmproject/libwebp/blob/v1.4.0/COPYING) |
| libwebpmux-3.dll | libwebp 1.4.0 (WebPGetMuxVersion returns 0x010400) | [BSD-3-Clause](https://github.com/webmproject/libwebp/blob/v1.4.0/COPYING) |
| libwinpthread-1.dll | MinGW-w64 winpthreads; generic resource version 1, 0, 0, 0 does not identify its source revision | [MIT and BSD-3-Clause](https://github.com/mingw-w64/mingw-w64/blob/master/mingw-w64-libraries/winpthreads/COPYING) (exact build not identified; see below) |
| libzstd.dll | Zstandard 1.5.6 (embedded version string) | [BSD-3-Clause (selected option)](https://github.com/facebook/zstd/blob/v1.5.6/LICENSE) |
| msvcp140.dll | Microsoft Visual C++ 14.44.35211.0 (version resource) | [Proprietary Microsoft runtime terms](https://visualstudio.microsoft.com/license-terms/vs2022-cruntime/) |
| msvcp140_1.dll | Microsoft Visual C++ 14.44.35211.0 (version resource) | [Proprietary Microsoft runtime terms](https://visualstudio.microsoft.com/license-terms/vs2022-cruntime/) |
| msvcp140_2.dll | Microsoft Visual C++ 14.44.35211.0 (version resource) | [Proprietary Microsoft runtime terms](https://visualstudio.microsoft.com/license-terms/vs2022-cruntime/) |
| msvcp140_atomic_wait.dll | Microsoft Visual C++ 14.44.35211.0 (version resource) | [Proprietary Microsoft runtime terms](https://visualstudio.microsoft.com/license-terms/vs2022-cruntime/) |
| msvcp140_codecvt_ids.dll | Microsoft Visual C++ 14.44.35211.0 (version resource) | [Proprietary Microsoft runtime terms](https://visualstudio.microsoft.com/license-terms/vs2022-cruntime/) |
| qpdf30.dll | qpdf 12.3.2 (embedded version and licence strings) | [Apache-2.0](https://github.com/qpdf/qpdf/blob/v12.3.2/LICENSE.txt) |
| vcruntime140.dll | Microsoft Visual C++ 14.44.35211.0 (version resource) | [Proprietary Microsoft runtime terms](https://visualstudio.microsoft.com/license-terms/vs2022-cruntime/) |
| vcruntime140_1.dll | Microsoft Visual C++ 14.44.35211.0 (version resource) | [Proprietary Microsoft runtime terms](https://visualstudio.microsoft.com/license-terms/vs2022-cruntime/) |
| zlib1.dll | zlib 1.3.1 (embedded version/copyright strings) | [Zlib](https://github.com/madler/zlib/blob/v1.3.1/LICENSE) |

### Version resources and binary identities

The four resource columns quote ProductName, FileVersion, CompanyName and
LegalCopyright respectively. Empty resource values are shown as `absent`.
SHA-256 identifies the payload binary checked for each row.

| DLL | ProductName | FileVersion | CompanyName | LegalCopyright | SHA-256 |
|---|---|---|---|---|---|
| concrt140.dll | Microsoft® Visual Studio® | 14.44.35211.0 | Microsoft Corporation | © Microsoft Corporation. All rights reserved. | `2405355f0a58067b258f8df33c327e3a3d716eaac5a3a5aebb757842d85bd376` |
| gsdll64.dll | GPL Ghostscript | 10.07.0 | absent | Copyright (C) 2025 Artifex Software, Inc.  All rights reserved. | `1dce67538777ab2f312890f9a2f0ffcff6a4c58ef1149dc6a44f8bd97b31030d` |
| libLerc.dll | absent | absent | absent | absent | `4ab688c7c5c4afdfee0f519f942759137067a7876a1c1bb825ee575b0a5760b1` |
| libarchive-13.dll | absent | absent | absent | absent | `98b9b7e9259f23eab6749ee25cca2c0643f09df6b23c58229fd43bf6249195e9` |
| libb2-1.dll | absent | absent | absent | absent | `7fb8418a1172042dab5227fcd466b1bf293737f5b5cf35359e851516227f109c` |
| libbrotlicommon.dll | absent | absent | absent | absent | `62f363f6aac0d54ce7b115c0412b19e0fe5480f4e6fc1254f663b0ab6868e46f` |
| libbrotlidec.dll | absent | absent | absent | absent | `7d6c0f954b6f2db1c1c5fd5904886ae055859a02ca31b6dde5f96f6b0259d23f` |
| libbz2-1.dll | absent | absent | absent | absent | `b79cd3a7102e359ef6324e98966a67939e58ec2b651ae2847cae84a4dfa453f7` |
| libcairo-2.dll | absent | absent | absent | absent | `c531e50be733f641e39419bf62cb799698b20086afb958d73f56677ea0c3f9da` |
| libcrypto-3-x64.dll | The OpenSSL Toolkit | 3.3.1 | The OpenSSL Project, https://www.openssl.org/ | Copyright 1998-2024 The OpenSSL Authors. All rights reserved. | `c0674a225d30f1642ca1da45ac040a9c1885d8f23883532b42987bae458edc4d` |
| libdatrie-1.dll | absent | absent | absent | absent | `f760aef8a31b7c3670484ca4eabab1ab8e95c14052167e191463f6371c3f0850` |
| libdeflate.dll | absent | absent | absent | absent | `b6ee7b31a23605d8e8b9be5eae782a3ddf7adf2b7ca2c8e0041bdfd4fe4659ee` |
| libexpat-1.dll | absent | absent | absent | absent | `d9ea333175b1e995bbe6a062567f38ff362f1b2f369fa8ebdb0eeed21813bdc6` |
| libffi-8.dll | absent | absent | absent | absent | `f1ed51652b3746c1b4bce497b7041e677e5d80c5ab8198efebb8fc6f75329ae8` |
| libfontconfig-1.dll | absent | absent | absent | absent | `d6c70b7e205f24ff96b29a80849b59c84f8701b311434f64f2bf93bd36bdb163` |
| libfreetype-6.dll | FreeType | 2.13.2 | The FreeType Project | © 2000-2023 The FreeType Project www.freetype.org. All rights reserved. | `5297f754dfca04abdb0d21705d5afc3c4122aa25c7afbdd87900313cb780c868` |
| libfribidi-0.dll | absent | absent | absent | absent | `449085380e54089871ccc9f32b715f65a2e53eb9f5125793fed900461d29a420` |
| libgcc_s_seh-1.dll | absent | absent | absent | absent | `b22b954397a52703579d92db64b57812af70f2afcafe2e742a009c1640b9ec1a` |
| libgif-7.dll | absent | absent | absent | absent | `a1a179853ae6fad8eb045b8e9f12c55e6fc99929446b02fa345512354cf5e582` |
| libgio-2.0-0.dll | GLib | 2.80.2.0 | The GLib developer community | Copyright 2006-2011 Red Hat, Inc. and others. | `07bda2471ca0490598d1e6fbdfc8958cd91926d68effc90d9eda0ea2f9279c7c` |
| libglib-2.0-0.dll | GLib | 2.80.2.0 | The GLib developer community | Copyright 1995-2011 Peter Mattis, Spencer Kimball, Josh MacDonald and others. | `12b2f4d609a5d3cf714a8c502074409d32f21082a682373f4e1bca36821f08bc` |
| libgmodule-2.0-0.dll | GLib | 2.80.2.0 | The GLib developer community | Copyright 1998-2011 Tim Janik and others. | `8cf9bb9be24c88a66ad478214a55357a9d44702636789dfa436ca509457d781c` |
| libgobject-2.0-0.dll | GLib | 2.80.2.0 | The GLib developer community | Copyright 1998-2011 Tim Janik, Red Hat, Inc. and others | `4fcf4fb2d5ef234e717b389f3b637f05ee6ff111b698ef59664394f10622aef6` |
| libgraphite2.dll | absent | absent | absent | absent | `f927efecd958f0e54a24ae297f86cd6aed05e7fc20e5da0882050ab9ec464395` |
| libharfbuzz-0.dll | absent | absent | absent | absent | `c1fa05f089041e348c9fcf18ae115942c989ac5259069d0ae83aa63e9a7c66ea` |
| libiconv-2.dll | libiconv: character set conversion library | 1.17 | Free Software Foundation | Copyright (C) 1999-2022 | `967189adfbc889fde89aafc867f7a1f02731f8592cf6fd5a4ace1929213e2e13` |
| libicudt75.dll | absent | absent | absent | absent | `6a60829e1c13fd73043af6f475f85971a42eb5553e88c92f26b8802bde92c2f4` |
| libicuin75.dll | absent | absent | absent | absent | `9fad2353a168134305e67a62fedff21cd43293055b7f4b9c39ff30cc78f30be0` |
| libicuuc75.dll | absent | absent | absent | absent | `60e6f91536efd0a8e408b060edb76a2148a7a397399b76ee39e4ed61de0774b0` |
| libintl-8.dll | GNU libintl: accessing NLS message catalogs | 0.22.5 | Free Software Foundation | Copyright (C) 1995-2019 | `42a63cb4c3c28a683d9f6c3510de5ec17849eb18c097fa02cd78aeb800bff202` |
| libjbig-0.dll | absent | absent | absent | absent | `275a827ba6839d47cfdbe059db1b1b403a92ff26e2b76a29362915487868bef2` |
| libjpeg-8.dll | absent | absent | absent | absent | `e44514c4e7753635e79bdb668f1e10315c1a93287f8d044ae74594ed57de619d` |
| libleptonica-6.dll | absent | absent | absent | absent | `26861baff4d25446a03ed1f6064d2eae7435eddf51bb36af4e634c0eb4eb3af0` |
| liblz4.dll | LZ4 | 1.9.4.0 | Yann Collet | Copyright (C) 2013-2020, Yann Collet | `1b64d6429ae4aacf9eb35b8158d98556859a5c5e8ee817e155da343e194dd8e3` |
| liblzma-5.dll | XZ Utils <https://tukaani.org/xz/> | 5.6.2 | The Tukaani Project <https://tukaani.org/> | absent | `3a599d97ea4dd002166ee7ffdc527c129d2cf8b05e9152ca7cae006c4187977e` |
| libopenjp2-7.dll | absent | absent | absent | absent | `5ff762ff6d672a06ee502819daf1494aa3aa3acf408805f0429303e026705011` |
| libpango-1.0-0.dll | Pango | 1.52.2.0 | Red Hat Software | Copyright 1999 Red Hat Software. | `834caf40403a447634b0e80ff4ea290f1ee361364cf24ffc8bb55b048f9254a9` |
| libpangocairo-1.0-0.dll | PangoCairo | 1.52.2.0 | Red Hat Software | Copyright 2010 Red Hat Software. | `ee706c4561af24de6cbe7ad10b46852fc8b0f328534ea2beb5f1147696e87b55` |
| libpangoft2-1.0-0.dll | PangoFT2 | 1.52.2.0 | Red Hat Software | Copyright 1999 Red Hat Software. Copyright 2000 Tor Lillqvist | `7c80bc1949255a8bc62fe05ab003b777aa844ac8f6c5da1ebc4c49ee35f3b9b8` |
| libpangowin32-1.0-0.dll | PangoWin32 | 1.52.2.0 | Red Hat Software | Copyright 1999 Red Hat Software. Copyright 2000 Tor Lillqvist | `d940a831f2a9be33dd36ff3d8b97488a068b1699fb6b2e874633d4d5564f301c` |
| libpcre2-8-0.dll | absent | absent | absent | absent | `5ffa31709c275120a745f9f714974db1e86c8fd54f8ca6889617530dffbff95b` |
| libpixman-1-0.dll | absent | absent | absent | absent | `8f8b8f09ec8fe9945ba76fadf8a04183056afd2c35aa7be1808e1a1301d87757` |
| libpng16-16.dll | absent | absent | absent | absent | `f1b0a9d6cf3b8809c22fa0e27b5b82d9357e5bca43ab0ce8762f55fb303ed23f` |
| libsharpyuv-0.dll | absent | absent | absent | absent | `60bcc87ac64a834e967e9ec9461be37395dbc090c579f3e23497ef69a5d8323e` |
| libstdc++-6.dll | absent | absent | absent | absent | `0d9c01ab1771df439c75f144b2d855b4ac400243f006d14d9a043493de628f0d` |
| libtesseract-5.dll | absent | absent | absent | absent | `279488c41bd341edaa03dcd097faa33604ba330e6254ac97bcaf2229d8d7ac1a` |
| libthai-0.dll | absent | absent | absent | absent | `420e08cedaf9daaabcf8f6c92349d9dadb7b5ad9e4e79d1126bb2a55a7cdbe09` |
| libtiff-6.dll | absent | absent | absent | absent | `e000306d3de299b05ebef443e48c1486d9fa291b0244f6ca6225843b75fdf581` |
| libwebp-7.dll | absent | absent | absent | absent | `687b8859e1f739dad5800fdc293a6ee1fd0dd4b33380ab283681a5a12eb3d4fa` |
| libwebpmux-3.dll | absent | absent | absent | absent | `ad10bacecd37b44c7c2c813da098a8bf6a42a3bf0152f7f33726d216815558f9` |
| libwinpthread-1.dll | absent | 1, 0, 0, 0 | MinGW-W64 Project. All rights reserved. | Copyright (C) MinGW-W64 Project Members 2010-2023 | `bbcbe5eb8e806f3537585d4c9832b4ee15f86617328a566695d7d3728aa370ee` |
| libzstd.dll | absent | absent | absent | absent | `f216ea8efb5b3bb9ad3d938fb9ac07e3b8f78c2c92faab03d2c468d0b6798a5a` |
| msvcp140.dll | Microsoft® Visual Studio® | 14.44.35211.0 | Microsoft Corporation | © Microsoft Corporation. All rights reserved. | `0f885b509a685d2bbfa652fed26b5fb31d88fbdab0a978c641d1c7b8aa460aa9` |
| msvcp140_1.dll | Microsoft® Visual Studio® | 14.44.35211.0 | Microsoft Corporation | © Microsoft Corporation. All rights reserved. | `bfad5aef4c63a669e3c140655cdfdf395b6c979b400a447bd5dcb65ed8826c3d` |
| msvcp140_2.dll | Microsoft® Visual Studio® | 14.44.35211.0 | Microsoft Corporation | © Microsoft Corporation. All rights reserved. | `3ea06f0ee098b4823cb79599df3780e7f23cce52c19aac31d2a0d47efe33a5e9` |
| msvcp140_atomic_wait.dll | Microsoft® Visual Studio® | 14.44.35211.0 | Microsoft Corporation | © Microsoft Corporation. All rights reserved. | `640b2aefced484d0368eea5bdd06addd0658a3a70a49256e560d6923b404a479` |
| msvcp140_codecvt_ids.dll | Microsoft® Visual Studio® | 14.44.35211.0 | Microsoft Corporation | © Microsoft Corporation. All rights reserved. | `f2069a52880ec885ee7f0511186100eb7fada0411a2b4948fafea7735b878a18` |
| qpdf30.dll | absent | absent | absent | absent | `623338ff5a9caab476f9e80ccc40c28c194208f4bc5d8e51eac7fca792e2e969` |
| vcruntime140.dll | Microsoft® Visual Studio® | 14.44.35211.0 | Microsoft Corporation | © Microsoft Corporation. All rights reserved. | `d5e4d9a3e835fa679450145d6a7d94e36573a509317111904d9b3712c30d9066` |
| vcruntime140_1.dll | Microsoft® Visual Studio® | 14.44.35211.0 | Microsoft Corporation | © Microsoft Corporation. All rights reserved. | `1f2d41c4aa5db0bc33ebf7b66d72943a817d7ce6cbe880502a9403823633093f` |
| zlib1.dll | absent | absent | absent | absent | `cb7ab3788d10940df874acd97b1821bbb5ee4a91f3eec11982bb5bf7a3c96443` |

### Licence identity without an exact build

These four DLLs match the Tesseract 5.4.0.20240606 upstream archive byte for
byte, but their exact upstream build is not identified. Each project uses one
licence in all its releases, so the licence does not depend on the build:

- `libbrotlicommon.dll`: no version resource or version export; the
  available MSYS2 1.1.0-4 DLL does not match. Brotli is MIT ("Copyright (c)
  2009, 2010, 2013-2016 by the Brotli Authors.").
- `libdeflate.dll`: no version resource or identifying version string; the
  candidate 1.20-1 package is no longer in the MSYS2 index. libdeflate is MIT
  ("Copyright 2016 Eric Biggers").
- `libgcc_s_seh-1.dll`: no version resource; compiler markers name 13.2.0
  and 14.1.0. The GCC runtime library is GPL-3.0-or-later with the GCC
  Runtime Library Exception 3.1 in both versions.
- `libwinpthread-1.dll`: generic resource version `1, 0, 0, 0`. The
  winpthreads `COPYING` has an MIT block (mingw-w64 project) and a
  BSD-3-Clause block (Lockless Inc.).

## Application dependency inventory

The following inventories record declared package licences. They include
build and test dependencies as a conservative superset; an entry does not
mean that the whole package ships in the installer. Runtime JavaScript is
bundled into the frontend; Rust runtime dependencies are linked into the app.
Package source archives contain the full licence and copyright notices.
Recheck the inventory when dependency versions change.

### Rust packages

Declared licences from Cargo metadata for this checkout (default features).
Source links contain the package licence texts. This superset also includes
build, test and other-target packages resolved by Cargo.

| Package | Version | Declared licence | Licence texts / source |
|---|---|---|---|
| ab_glyph | 0.2.32 | Apache-2.0 | [Package source](https://docs.rs/crate/ab_glyph/0.2.32/source/) |
| ab_glyph_rasterizer | 0.1.10 | Apache-2.0 | [Package source](https://docs.rs/crate/ab_glyph_rasterizer/0.1.10/source/) |
| adler2 | 2.0.1 | 0BSD OR MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/adler2/2.0.1/source/) |
| aes | 0.8.4 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/aes/0.8.4/source/) |
| aes | 0.9.3 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/aes/0.9.3/source/) |
| aho-corasick | 1.1.5 | Unlicense OR MIT | [Package source](https://docs.rs/crate/aho-corasick/1.1.5/source/) |
| aligned | 0.4.3 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/aligned/0.4.3/source/) |
| aligned-vec | 0.6.4 | MIT | [Package source](https://docs.rs/crate/aligned-vec/0.6.4/source/) |
| alloc-no-stdlib | 2.0.4 | BSD-3-Clause | [Package source](https://docs.rs/crate/alloc-no-stdlib/2.0.4/source/) |
| alloc-stdlib | 0.2.4 | BSD-3-Clause | [Package source](https://docs.rs/crate/alloc-stdlib/0.2.4/source/) |
| allocator-api2 | 0.2.21 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/allocator-api2/0.2.21/source/) |
| android_system_properties | 0.1.6 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/android_system_properties/0.1.6/source/) |
| anes | 0.1.6 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/anes/0.1.6/source/) |
| anstyle | 1.0.14 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/anstyle/1.0.14/source/) |
| anyhow | 1.0.104 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/anyhow/1.0.104/source/) |
| approx | 0.5.1 | Apache-2.0 | [Package source](https://docs.rs/crate/approx/0.5.1/source/) |
| arbitrary | 1.5.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/arbitrary/1.5.0/source/) |
| arg_enum_proc_macro | 0.3.4 | MIT | [Package source](https://docs.rs/crate/arg_enum_proc_macro/0.3.4/source/) |
| arrayvec | 0.7.8 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/arrayvec/0.7.8/source/) |
| as-slice | 0.2.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/as-slice/0.2.1/source/) |
| async-broadcast | 0.7.2 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/async-broadcast/0.7.2/source/) |
| async-executor | 1.14.0 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/async-executor/1.14.0/source/) |
| async-channel | 2.5.0 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/async-channel/2.5.0/source/) |
| async-io | 2.6.0 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/async-io/2.6.0/source/) |
| async-lock | 3.4.2 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/async-lock/3.4.2/source/) |
| async-process | 2.5.0 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/async-process/2.5.0/source/) |
| async-recursion | 1.2.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/async-recursion/1.2.0/source/) |
| async-signal | 0.2.14 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/async-signal/0.2.14/source/) |
| async-task | 4.7.1 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/async-task/4.7.1/source/) |
| async-trait | 0.1.92 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/async-trait/0.1.92/source/) |
| atk | 0.18.2 | MIT | [Package source](https://docs.rs/crate/atk/0.18.2/source/) |
| atk-sys | 0.18.2 | MIT | [Package source](https://docs.rs/crate/atk-sys/0.18.2/source/) |
| atoi | 2.0.0 | MIT | [Package source](https://docs.rs/crate/atoi/2.0.0/source/) |
| atomic-waker | 1.1.2 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/atomic-waker/1.1.2/source/) |
| autocfg | 1.5.1 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/autocfg/1.5.1/source/) |
| av-scenechange | 0.14.1 | MIT | [Package source](https://docs.rs/crate/av-scenechange/0.14.1/source/) |
| av1-grain | 0.2.5 | BSD-2-Clause | [Package source](https://docs.rs/crate/av1-grain/0.2.5/source/) |
| avif-serialize | 0.8.9 | BSD-3-Clause | [Package source](https://docs.rs/crate/avif-serialize/0.8.9/source/) |
| aws-lc-rs | 1.18.2 | ISC AND (Apache-2.0 OR ISC) | [Package source](https://docs.rs/crate/aws-lc-rs/1.18.2/source/) |
| aws-lc-sys | 0.46.0 | ISC AND (Apache-2.0 OR ISC) AND Apache-2.0 AND MIT AND BSD-3-Clause AND (Apache-2.0 OR ISC OR MIT) AND (Apache-2.0 OR ISC OR MIT-0) | [Package source](https://docs.rs/crate/aws-lc-sys/0.46.0/source/) |
| base64 | 0.21.7 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/base64/0.21.7/source/) |
| base64 | 0.22.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/base64/0.22.1/source/) |
| base64 | 0.23.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/base64/0.23.1/source/) |
| base64ct | 1.8.3 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/base64ct/1.8.3/source/) |
| bit_field | 0.10.3 | Apache-2.0/MIT | [Package source](https://docs.rs/crate/bit_field/0.10.3/source/) |
| bit-set | 0.11.1 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/bit-set/0.11.1/source/) |
| bit-set | 0.8.0 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/bit-set/0.8.0/source/) |
| bit-vec | 0.10.1 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/bit-vec/0.10.1/source/) |
| bit-vec | 0.8.0 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/bit-vec/0.8.0/source/) |
| bitflags | 1.3.2 | MIT/Apache-2.0 | [Package source](https://docs.rs/crate/bitflags/1.3.2/source/) |
| bitflags | 2.13.2 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/bitflags/2.13.2/source/) |
| bitstream-io | 4.10.0 | MIT/Apache-2.0 | [Package source](https://docs.rs/crate/bitstream-io/4.10.0/source/) |
| block-buffer | 0.10.4 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/block-buffer/0.10.4/source/) |
| block-buffer | 0.12.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/block-buffer/0.12.1/source/) |
| block-padding | 0.3.3 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/block-padding/0.3.3/source/) |
| block-padding | 0.4.2 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/block-padding/0.4.2/source/) |
| block2 | 0.6.2 | MIT | [Package source](https://docs.rs/crate/block2/0.6.2/source/) |
| blocking | 1.7.0 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/blocking/1.7.0/source/) |
| borsh | 1.8.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/borsh/1.8.1/source/) |
| borsh-derive | 1.8.1 | Apache-2.0 | [Package source](https://docs.rs/crate/borsh-derive/1.8.1/source/) |
| brotli | 8.0.4 | BSD-3-Clause AND MIT | [Package source](https://docs.rs/crate/brotli/8.0.4/source/) |
| brotli-decompressor | 5.0.3 | BSD-3-Clause/MIT | [Package source](https://docs.rs/crate/brotli-decompressor/5.0.3/source/) |
| bs58 | 0.5.1 | MIT/Apache-2.0 | [Package source](https://docs.rs/crate/bs58/0.5.1/source/) |
| built | 0.8.1 | MIT | [Package source](https://docs.rs/crate/built/0.8.1/source/) |
| bumpalo | 3.20.3 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/bumpalo/3.20.3/source/) |
| bytemuck | 1.25.2 | Zlib OR Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/bytemuck/1.25.2/source/) |
| byteorder | 1.5.0 | Unlicense OR MIT | [Package source](https://docs.rs/crate/byteorder/1.5.0/source/) |
| byteorder-lite | 0.1.0 | Unlicense OR MIT | [Package source](https://docs.rs/crate/byteorder-lite/0.1.0/source/) |
| bytes | 1.12.1 | MIT | [Package source](https://docs.rs/crate/bytes/1.12.1/source/) |
| cairo-rs | 0.18.5 | MIT | [Package source](https://docs.rs/crate/cairo-rs/0.18.5/source/) |
| cairo-sys-rs | 0.18.2 | MIT | [Package source](https://docs.rs/crate/cairo-sys-rs/0.18.2/source/) |
| camino | 1.2.6 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/camino/1.2.6/source/) |
| cargo_metadata | 0.19.2 | MIT | [Package source](https://docs.rs/crate/cargo_metadata/0.19.2/source/) |
| cargo_toml | 0.22.3 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/cargo_toml/0.22.3/source/) |
| cargo-platform | 0.1.9 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/cargo-platform/0.1.9/source/) |
| cast | 0.3.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/cast/0.3.0/source/) |
| cbc | 0.1.2 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/cbc/0.1.2/source/) |
| cbc | 0.2.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/cbc/0.2.1/source/) |
| cc | 1.2.62 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/cc/1.2.62/source/) |
| cesu8 | 1.1.0 | Apache-2.0/MIT | [Package source](https://docs.rs/crate/cesu8/1.1.0/source/) |
| cfb | 0.7.3 | MIT | [Package source](https://docs.rs/crate/cfb/0.7.3/source/) |
| cfg_aliases | 0.2.2 | MIT | [Package source](https://docs.rs/crate/cfg_aliases/0.2.2/source/) |
| cfg-expr | 0.15.8 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/cfg-expr/0.15.8/source/) |
| cfg-if | 1.0.5 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/cfg-if/1.0.5/source/) |
| ciborium | 0.2.2 | Apache-2.0 | [Package source](https://docs.rs/crate/ciborium/0.2.2/source/) |
| ciborium-io | 0.2.2 | Apache-2.0 | [Package source](https://docs.rs/crate/ciborium-io/0.2.2/source/) |
| ciborium-ll | 0.2.2 | Apache-2.0 | [Package source](https://docs.rs/crate/ciborium-ll/0.2.2/source/) |
| cipher | 0.4.4 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/cipher/0.4.4/source/) |
| cipher | 0.5.2 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/cipher/0.5.2/source/) |
| clap | 4.6.7 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/clap/4.6.7/source/) |
| clap_builder | 4.6.7 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/clap_builder/4.6.7/source/) |
| clap_lex | 1.1.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/clap_lex/1.1.1/source/) |
| cmake | 0.1.58 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/cmake/0.1.58/source/) |
| color_quant | 1.1.0 | MIT | [Package source](https://docs.rs/crate/color_quant/1.1.0/source/) |
| combine | 4.6.9 | MIT | [Package source](https://docs.rs/crate/combine/4.6.9/source/) |
| concurrent-queue | 2.5.0 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/concurrent-queue/2.5.0/source/) |
| const-oid | 0.10.2 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/const-oid/0.10.2/source/) |
| const-oid | 0.9.6 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/const-oid/0.9.6/source/) |
| cookie | 0.18.2 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/cookie/0.18.2/source/) |
| core_detect | 1.0.0 | MIT/Apache-2.0 | [Package source](https://docs.rs/crate/core_detect/1.0.0/source/) |
| core-foundation | 0.10.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/core-foundation/0.10.1/source/) |
| core-foundation | 0.9.4 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/core-foundation/0.9.4/source/) |
| core-foundation-sys | 0.8.7 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/core-foundation-sys/0.8.7/source/) |
| core-graphics | 0.23.2 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/core-graphics/0.23.2/source/) |
| core-graphics | 0.25.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/core-graphics/0.25.0/source/) |
| core-graphics-types | 0.1.3 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/core-graphics-types/0.1.3/source/) |
| core-graphics-types | 0.2.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/core-graphics-types/0.2.0/source/) |
| core-text | 20.1.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/core-text/20.1.0/source/) |
| cpubits | 0.1.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/cpubits/0.1.1/source/) |
| cpufeatures | 0.2.17 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/cpufeatures/0.2.17/source/) |
| cpufeatures | 0.3.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/cpufeatures/0.3.1/source/) |
| crc | 3.4.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/crc/3.4.0/source/) |
| crc-catalog | 2.5.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/crc-catalog/2.5.0/source/) |
| crc32fast | 1.5.3 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/crc32fast/1.5.3/source/) |
| criterion | 0.5.1 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/criterion/0.5.1/source/) |
| criterion-plot | 0.5.0 | MIT/Apache-2.0 | [Package source](https://docs.rs/crate/criterion-plot/0.5.0/source/) |
| crossbeam-deque | 0.8.8 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/crossbeam-deque/0.8.8/source/) |
| crossbeam-epoch | 0.9.21 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/crossbeam-epoch/0.9.21/source/) |
| crossbeam-channel | 0.5.17 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/crossbeam-channel/0.5.17/source/) |
| crossbeam-queue | 0.3.14 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/crossbeam-queue/0.3.14/source/) |
| crossbeam-utils | 0.8.23 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/crossbeam-utils/0.8.23/source/) |
| crunchy | 0.2.4 | MIT | [Package source](https://docs.rs/crate/crunchy/0.2.4/source/) |
| crypto-common | 0.1.7 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/crypto-common/0.1.7/source/) |
| crypto-common | 0.2.2 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/crypto-common/0.2.2/source/) |
| cssparser | 0.36.0 | MPL-2.0 | [Package source](https://docs.rs/crate/cssparser/0.36.0/source/) |
| cssparser-macros | 0.6.1 | MPL-2.0 | [Package source](https://docs.rs/crate/cssparser-macros/0.6.1/source/) |
| ctor | 0.8.0 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/ctor/0.8.0/source/) |
| ctor-proc-macro | 0.0.7 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/ctor-proc-macro/0.0.7/source/) |
| darling | 0.23.0 | MIT | [Package source](https://docs.rs/crate/darling/0.23.0/source/) |
| darling | 0.24.1 | MIT | [Package source](https://docs.rs/crate/darling/0.24.1/source/) |
| darling_core | 0.23.0 | MIT | [Package source](https://docs.rs/crate/darling_core/0.23.0/source/) |
| darling_core | 0.24.1 | MIT | [Package source](https://docs.rs/crate/darling_core/0.24.1/source/) |
| darling_macro | 0.23.0 | MIT | [Package source](https://docs.rs/crate/darling_macro/0.23.0/source/) |
| darling_macro | 0.24.1 | MIT | [Package source](https://docs.rs/crate/darling_macro/0.24.1/source/) |
| dbus | 0.9.12 | Apache-2.0/MIT | [Package source](https://docs.rs/crate/dbus/0.9.12/source/) |
| defmt | 1.2.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/defmt/1.2.0/source/) |
| defmt-macros | 1.2.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/defmt-macros/1.2.0/source/) |
| defmt-parser | 1.1.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/defmt-parser/1.1.0/source/) |
| der | 0.7.10 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/der/0.7.10/source/) |
| deranged | 0.5.9 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/deranged/0.5.9/source/) |
| derive_more | 2.1.1 | MIT | [Package source](https://docs.rs/crate/derive_more/2.1.1/source/) |
| derive_more-impl | 2.1.1 | MIT | [Package source](https://docs.rs/crate/derive_more-impl/2.1.1/source/) |
| digest | 0.10.7 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/digest/0.10.7/source/) |
| digest | 0.11.3 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/digest/0.11.3/source/) |
| directories | 5.0.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/directories/5.0.1/source/) |
| dirs | 6.0.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/dirs/6.0.0/source/) |
| dirs-sys | 0.4.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/dirs-sys/0.4.1/source/) |
| dirs-sys | 0.5.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/dirs-sys/0.5.0/source/) |
| dispatch2 | 0.3.1 | Zlib OR Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/dispatch2/0.3.1/source/) |
| displaydoc | 0.2.7 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/displaydoc/0.2.7/source/) |
| dlib | 0.5.3 | MIT | [Package source](https://docs.rs/crate/dlib/0.5.3/source/) |
| dlopen2 | 0.8.2 | MIT | [Package source](https://docs.rs/crate/dlopen2/0.8.2/source/) |
| dlopen2_derive | 0.4.3 | MIT | [Package source](https://docs.rs/crate/dlopen2_derive/0.4.3/source/) |
| dom_query | 0.27.0 | MIT | [Package source](https://docs.rs/crate/dom_query/0.27.0/source/) |
| dotenvy | 0.15.7 | MIT | [Package source](https://docs.rs/crate/dotenvy/0.15.7/source/) |
| dpi | 0.1.2 | Apache-2.0 AND MIT | [Package source](https://docs.rs/crate/dpi/0.1.2/source/) |
| dtoa | 1.0.11 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/dtoa/1.0.11/source/) |
| dtoa-short | 0.3.5 | MPL-2.0 | [Package source](https://docs.rs/crate/dtoa-short/0.3.5/source/) |
| dtor | 0.3.0 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/dtor/0.3.0/source/) |
| dtor-proc-macro | 0.0.6 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/dtor-proc-macro/0.0.6/source/) |
| dunce | 1.0.5 | CC0-1.0 OR MIT-0 OR Apache-2.0 | [Package source](https://docs.rs/crate/dunce/1.0.5/source/) |
| dwrote | 0.11.5 | MPL-2.0 | [Package source](https://docs.rs/crate/dwrote/0.11.5/source/) |
| dyn-clone | 1.0.20 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/dyn-clone/1.0.20/source/) |
| ecb | 0.2.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/ecb/0.2.1/source/) |
| either | 1.19.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/either/1.19.0/source/) |
| embed_plist | 1.2.2 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/embed_plist/1.2.2/source/) |
| embed-resource | 3.0.12 | MIT | [Package source](https://docs.rs/crate/embed-resource/3.0.12/source/) |
| encoding_rs | 0.8.42 | (Apache-2.0 OR MIT) AND BSD-3-Clause | [Package source](https://docs.rs/crate/encoding_rs/0.8.42/source/) |
| endi | 1.1.1 | MIT | [Package source](https://docs.rs/crate/endi/1.1.1/source/) |
| enumflags2 | 0.7.12 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/enumflags2/0.7.12/source/) |
| enumflags2_derive | 0.7.12 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/enumflags2_derive/0.7.12/source/) |
| equator | 0.4.2 | MIT | [Package source](https://docs.rs/crate/equator/0.4.2/source/) |
| equator-macro | 0.4.2 | MIT | [Package source](https://docs.rs/crate/equator-macro/0.4.2/source/) |
| equivalent | 1.0.3 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/equivalent/1.0.3/source/) |
| erased-serde | 0.4.10 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/erased-serde/0.4.10/source/) |
| errno | 0.3.14 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/errno/0.3.14/source/) |
| etcetera | 0.8.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/etcetera/0.8.0/source/) |
| event-listener | 5.4.2 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/event-listener/5.4.2/source/) |
| event-listener-strategy | 0.5.4 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/event-listener-strategy/0.5.4/source/) |
| exr | 1.74.2 | BSD-3-Clause | [Package source](https://docs.rs/crate/exr/1.74.2/source/) |
| fastrand | 2.5.0 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/fastrand/2.5.0/source/) |
| fax | 0.2.7 | MIT | [Package source](https://docs.rs/crate/fax/0.2.7/source/) |
| fdeflate | 0.3.7 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/fdeflate/0.3.7/source/) |
| field-offset | 0.3.6 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/field-offset/0.3.6/source/) |
| find-msvc-tools | 0.1.15 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/find-msvc-tools/0.1.15/source/) |
| flate2 | 1.1.10 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/flate2/1.1.10/source/) |
| float-ord | 0.3.2 | MIT / Apache-2.0 | [Package source](https://docs.rs/crate/float-ord/0.3.2/source/) |
| flume | 0.11.1 | Apache-2.0/MIT | [Package source](https://docs.rs/crate/flume/0.11.1/source/) |
| fnv | 1.0.7 | Apache-2.0 / MIT | [Package source](https://docs.rs/crate/fnv/1.0.7/source/) |
| foldhash | 0.1.5 | Zlib | [Package source](https://docs.rs/crate/foldhash/0.1.5/source/) |
| foldhash | 0.2.0 | Zlib | [Package source](https://docs.rs/crate/foldhash/0.2.0/source/) |
| font-kit | 0.14.3 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/font-kit/0.14.3/source/) |
| foreign-types | 0.5.0 | MIT/Apache-2.0 | [Package source](https://docs.rs/crate/foreign-types/0.5.0/source/) |
| foreign-types-macros | 0.2.4 | MIT/Apache-2.0 | [Package source](https://docs.rs/crate/foreign-types-macros/0.2.4/source/) |
| foreign-types-shared | 0.3.1 | MIT/Apache-2.0 | [Package source](https://docs.rs/crate/foreign-types-shared/0.3.1/source/) |
| form_urlencoded | 1.2.2 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/form_urlencoded/1.2.2/source/) |
| freetype-sys | 0.20.1 | MIT | [Package source](https://docs.rs/crate/freetype-sys/0.20.1/source/) |
| fs_extra | 1.3.0 | MIT | [Package source](https://docs.rs/crate/fs_extra/1.3.0/source/) |
| futures-core | 0.3.34 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/futures-core/0.3.34/source/) |
| futures-executor | 0.3.34 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/futures-executor/0.3.34/source/) |
| futures-channel | 0.3.34 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/futures-channel/0.3.34/source/) |
| futures-intrusive | 0.5.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/futures-intrusive/0.5.0/source/) |
| futures-io | 0.3.34 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/futures-io/0.3.34/source/) |
| futures-lite | 2.6.1 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/futures-lite/2.6.1/source/) |
| futures-macro | 0.3.34 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/futures-macro/0.3.34/source/) |
| futures-sink | 0.3.34 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/futures-sink/0.3.34/source/) |
| futures-task | 0.3.34 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/futures-task/0.3.34/source/) |
| futures-util | 0.3.34 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/futures-util/0.3.34/source/) |
| gdk | 0.18.2 | MIT | [Package source](https://docs.rs/crate/gdk/0.18.2/source/) |
| gdk-pixbuf | 0.18.5 | MIT | [Package source](https://docs.rs/crate/gdk-pixbuf/0.18.5/source/) |
| gdk-pixbuf-sys | 0.18.0 | MIT | [Package source](https://docs.rs/crate/gdk-pixbuf-sys/0.18.0/source/) |
| gdk-sys | 0.18.2 | MIT | [Package source](https://docs.rs/crate/gdk-sys/0.18.2/source/) |
| gdkwayland-sys | 0.18.2 | MIT | [Package source](https://docs.rs/crate/gdkwayland-sys/0.18.2/source/) |
| gdkx11 | 0.18.2 | MIT | [Package source](https://docs.rs/crate/gdkx11/0.18.2/source/) |
| gdkx11-sys | 0.18.2 | MIT | [Package source](https://docs.rs/crate/gdkx11-sys/0.18.2/source/) |
| generic-array | 0.14.7 | MIT | [Package source](https://docs.rs/crate/generic-array/0.14.7/source/) |
| getrandom | 0.2.17 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/getrandom/0.2.17/source/) |
| getrandom | 0.3.4 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/getrandom/0.3.4/source/) |
| getrandom | 0.4.3 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/getrandom/0.4.3/source/) |
| gif | 0.14.2 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/gif/0.14.2/source/) |
| gio | 0.18.4 | MIT | [Package source](https://docs.rs/crate/gio/0.18.4/source/) |
| gio-sys | 0.18.1 | MIT | [Package source](https://docs.rs/crate/gio-sys/0.18.1/source/) |
| glib | 0.18.5 | MIT | [Package source](https://docs.rs/crate/glib/0.18.5/source/) |
| glib-macros | 0.18.5 | MIT | [Package source](https://docs.rs/crate/glib-macros/0.18.5/source/) |
| glib-sys | 0.18.1 | MIT | [Package source](https://docs.rs/crate/glib-sys/0.18.1/source/) |
| glob | 0.3.4 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/glob/0.3.4/source/) |
| gobject-sys | 0.18.0 | MIT | [Package source](https://docs.rs/crate/gobject-sys/0.18.0/source/) |
| gtk | 0.18.2 | MIT | [Package source](https://docs.rs/crate/gtk/0.18.2/source/) |
| gtk-sys | 0.18.2 | MIT | [Package source](https://docs.rs/crate/gtk-sys/0.18.2/source/) |
| gtk3-macros | 0.18.2 | MIT | [Package source](https://docs.rs/crate/gtk3-macros/0.18.2/source/) |
| half | 2.7.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/half/2.7.1/source/) |
| hashbrown | 0.12.3 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/hashbrown/0.12.3/source/) |
| hashbrown | 0.15.5 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/hashbrown/0.15.5/source/) |
| hashbrown | 0.17.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/hashbrown/0.17.1/source/) |
| hashlink | 0.10.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/hashlink/0.10.0/source/) |
| heck | 0.4.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/heck/0.4.1/source/) |
| heck | 0.5.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/heck/0.5.0/source/) |
| hermit-abi | 0.5.3 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/hermit-abi/0.5.3/source/) |
| hex | 0.4.3 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/hex/0.4.3/source/) |
| hkdf | 0.12.4 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/hkdf/0.12.4/source/) |
| hmac | 0.12.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/hmac/0.12.1/source/) |
| home | 0.5.12 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/home/0.5.12/source/) |
| html5ever | 0.38.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/html5ever/0.38.0/source/) |
| http | 1.5.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/http/1.5.0/source/) |
| http-body | 1.1.0 | MIT | [Package source](https://docs.rs/crate/http-body/1.1.0/source/) |
| http-body-util | 0.1.5 | MIT | [Package source](https://docs.rs/crate/http-body-util/0.1.5/source/) |
| httparse | 1.10.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/httparse/1.10.1/source/) |
| hybrid-array | 0.4.15 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/hybrid-array/0.4.15/source/) |
| hyper | 1.12.0 | MIT | [Package source](https://docs.rs/crate/hyper/1.12.0/source/) |
| hyper-rustls | 0.27.10 | Apache-2.0 OR ISC OR MIT | [Package source](https://docs.rs/crate/hyper-rustls/0.27.10/source/) |
| hyper-util | 0.1.21 | MIT | [Package source](https://docs.rs/crate/hyper-util/0.1.21/source/) |
| chacha20 | 0.10.2 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/chacha20/0.10.2/source/) |
| chrono | 0.4.45 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/chrono/0.4.45/source/) |
| iana-time-zone | 0.1.65 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/iana-time-zone/0.1.65/source/) |
| iana-time-zone-haiku | 0.1.2 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/iana-time-zone-haiku/0.1.2/source/) |
| ico | 0.5.0 | MIT | [Package source](https://docs.rs/crate/ico/0.5.0/source/) |
| icu_collections | 2.4.0 | Unicode-3.0 | [Package source](https://docs.rs/crate/icu_collections/2.4.0/source/) |
| icu_locale_core | 2.4.0 | Unicode-3.0 | [Package source](https://docs.rs/crate/icu_locale_core/2.4.0/source/) |
| icu_normalizer | 2.4.0 | Unicode-3.0 | [Package source](https://docs.rs/crate/icu_normalizer/2.4.0/source/) |
| icu_normalizer_data | 2.4.0 | Unicode-3.0 | [Package source](https://docs.rs/crate/icu_normalizer_data/2.4.0/source/) |
| icu_properties | 2.4.0 | Unicode-3.0 | [Package source](https://docs.rs/crate/icu_properties/2.4.0/source/) |
| icu_properties_data | 2.4.0 | Unicode-3.0 | [Package source](https://docs.rs/crate/icu_properties_data/2.4.0/source/) |
| icu_provider | 2.4.0 | Unicode-3.0 | [Package source](https://docs.rs/crate/icu_provider/2.4.0/source/) |
| ident_case | 1.0.1 | MIT/Apache-2.0 | [Package source](https://docs.rs/crate/ident_case/1.0.1/source/) |
| idna | 1.1.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/idna/1.1.0/source/) |
| idna_adapter | 1.2.2 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/idna_adapter/1.2.2/source/) |
| image | 0.25.10 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/image/0.25.10/source/) |
| image-webp | 0.2.4 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/image-webp/0.2.4/source/) |
| imageproc | 0.25.1 | MIT | [Package source](https://docs.rs/crate/imageproc/0.25.1/source/) |
| imgref | 1.12.3 | CC0-1.0 OR Apache-2.0 | [Package source](https://docs.rs/crate/imgref/1.12.3/source/) |
| indexmap | 1.9.3 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/indexmap/1.9.3/source/) |
| indexmap | 2.14.2 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/indexmap/2.14.2/source/) |
| infer | 0.19.0 | MIT | [Package source](https://docs.rs/crate/infer/0.19.0/source/) |
| Inflector | 0.11.4 | BSD-2-Clause | [Package source](https://docs.rs/crate/Inflector/0.11.4/source/) |
| inout | 0.1.4 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/inout/0.1.4/source/) |
| inout | 0.2.5 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/inout/0.2.5/source/) |
| interpolate_name | 0.2.4 | MIT | [Package source](https://docs.rs/crate/interpolate_name/0.2.4/source/) |
| ipnet | 2.12.2 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/ipnet/2.12.2/source/) |
| is-docker | 0.2.0 | MIT | [Package source](https://docs.rs/crate/is-docker/0.2.0/source/) |
| is-terminal | 0.4.17 | MIT | [Package source](https://docs.rs/crate/is-terminal/0.4.17/source/) |
| is-wsl | 0.4.0 | MIT | [Package source](https://docs.rs/crate/is-wsl/0.4.0/source/) |
| itertools | 0.10.5 | MIT/Apache-2.0 | [Package source](https://docs.rs/crate/itertools/0.10.5/source/) |
| itertools | 0.12.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/itertools/0.12.1/source/) |
| itertools | 0.14.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/itertools/0.14.0/source/) |
| itoa | 1.0.18 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/itoa/1.0.18/source/) |
| javascriptcore-rs | 1.1.2 | MIT | [Package source](https://docs.rs/crate/javascriptcore-rs/1.1.2/source/) |
| javascriptcore-rs-sys | 1.1.1 | MIT | [Package source](https://docs.rs/crate/javascriptcore-rs-sys/1.1.1/source/) |
| jiff | 0.2.38 | Unlicense OR MIT | [Package source](https://docs.rs/crate/jiff/0.2.38/source/) |
| jiff-core | 0.1.1 | Unlicense OR MIT | [Package source](https://docs.rs/crate/jiff-core/0.1.1/source/) |
| jiff-static | 0.2.38 | Unlicense OR MIT | [Package source](https://docs.rs/crate/jiff-static/0.2.38/source/) |
| jiff-tzdb | 0.1.9 | Unlicense OR MIT | [Package source](https://docs.rs/crate/jiff-tzdb/0.1.9/source/) |
| jiff-tzdb-platform | 0.1.3 | Unlicense OR MIT | [Package source](https://docs.rs/crate/jiff-tzdb-platform/0.1.3/source/) |
| jni | 0.21.1 | MIT/Apache-2.0 | [Package source](https://docs.rs/crate/jni/0.21.1/source/) |
| jni | 0.22.4 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/jni/0.22.4/source/) |
| jni-macros | 0.22.4 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/jni-macros/0.22.4/source/) |
| jni-sys | 0.3.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/jni-sys/0.3.1/source/) |
| jni-sys | 0.4.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/jni-sys/0.4.1/source/) |
| jni-sys-macros | 0.4.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/jni-sys-macros/0.4.1/source/) |
| jobserver | 0.1.35 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/jobserver/0.1.35/source/) |
| js-sys | 0.3.106 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/js-sys/0.3.106/source/) |
| json-patch | 3.0.1 | MIT/Apache-2.0 | [Package source](https://docs.rs/crate/json-patch/3.0.1/source/) |
| jsonptr | 0.6.3 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/jsonptr/0.6.3/source/) |
| keyboard-types | 0.7.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/keyboard-types/0.7.0/source/) |
| lazy_static | 1.5.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/lazy_static/1.5.1/source/) |
| lebe | 0.5.3 | BSD-3-Clause | [Package source](https://docs.rs/crate/lebe/0.5.3/source/) |
| libappindicator | 0.9.0 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/libappindicator/0.9.0/source/) |
| libappindicator-sys | 0.9.0 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/libappindicator-sys/0.9.0/source/) |
| libc | 0.2.191 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/libc/0.2.191/source/) |
| libdbus-sys | 0.2.7 | Apache-2.0/MIT | [Package source](https://docs.rs/crate/libdbus-sys/0.2.7/source/) |
| libfuzzer-sys | 0.4.13 | (MIT OR Apache-2.0) AND NCSA | [Package source](https://docs.rs/crate/libfuzzer-sys/0.4.13/source/) |
| libloading | 0.7.4 | ISC | [Package source](https://docs.rs/crate/libloading/0.7.4/source/) |
| libloading | 0.8.9 | ISC | [Package source](https://docs.rs/crate/libloading/0.8.9/source/) |
| libm | 0.2.16 | MIT | [Package source](https://docs.rs/crate/libm/0.2.16/source/) |
| libredox | 0.1.25 | MIT | [Package source](https://docs.rs/crate/libredox/0.1.25/source/) |
| libsqlite3-sys | 0.30.1 | MIT | [Package source](https://docs.rs/crate/libsqlite3-sys/0.30.1/source/) |
| linux-raw-sys | 0.12.1 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/linux-raw-sys/0.12.1/source/) |
| litemap | 0.8.3 | Unicode-3.0 | [Package source](https://docs.rs/crate/litemap/0.8.3/source/) |
| lock_api | 0.4.14 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/lock_api/0.4.14/source/) |
| log | 0.4.34 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/log/0.4.34/source/) |
| loop9 | 0.1.5 | MIT | [Package source](https://docs.rs/crate/loop9/0.1.5/source/) |
| lopdf | 0.44.0 | MIT | [Package source](https://docs.rs/crate/lopdf/0.44.0/source/) |
| lru-slab | 0.1.3 | MIT OR Apache-2.0 OR Zlib | [Package source](https://docs.rs/crate/lru-slab/0.1.3/source/) |
| markup5ever | 0.38.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/markup5ever/0.38.0/source/) |
| matchers | 0.2.0 | MIT | [Package source](https://docs.rs/crate/matchers/0.2.0/source/) |
| matrixmultiply | 0.3.11 | MIT/Apache-2.0 | [Package source](https://docs.rs/crate/matrixmultiply/0.3.11/source/) |
| maybe-rayon | 0.1.1 | MIT | [Package source](https://docs.rs/crate/maybe-rayon/0.1.1/source/) |
| md-5 | 0.10.6 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/md-5/0.10.6/source/) |
| md-5 | 0.11.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/md-5/0.11.0/source/) |
| memchr | 2.8.3 | Unlicense OR MIT | [Package source](https://docs.rs/crate/memchr/2.8.3/source/) |
| memoffset | 0.9.1 | MIT | [Package source](https://docs.rs/crate/memoffset/0.9.1/source/) |
| mime | 0.3.17 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/mime/0.3.17/source/) |
| miniz_oxide | 0.8.9 | MIT OR Zlib OR Apache-2.0 | [Package source](https://docs.rs/crate/miniz_oxide/0.8.9/source/) |
| miniz_oxide | 0.9.1 | MIT OR Zlib OR Apache-2.0 | [Package source](https://docs.rs/crate/miniz_oxide/0.9.1/source/) |
| mio | 1.2.4 | MIT | [Package source](https://docs.rs/crate/mio/1.2.4/source/) |
| moxcms | 0.8.1 | BSD-3-Clause OR Apache-2.0 | [Package source](https://docs.rs/crate/moxcms/0.8.1/source/) |
| muda | 0.19.3 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/muda/0.19.3/source/) |
| multiversion_no_op | 1.0.0 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/multiversion_no_op/1.0.0/source/) |
| nalgebra | 0.32.6 | BSD-3-Clause | [Package source](https://docs.rs/crate/nalgebra/0.32.6/source/) |
| ndk | 0.9.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/ndk/0.9.0/source/) |
| ndk-sys | 0.6.0+11769913 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/ndk-sys/0.6.0+11769913/source/) |
| new_debug_unreachable | 1.0.6 | MIT | [Package source](https://docs.rs/crate/new_debug_unreachable/1.0.6/source/) |
| no_std_io2 | 0.9.4 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/no_std_io2/0.9.4/source/) |
| nom | 8.0.0 | MIT | [Package source](https://docs.rs/crate/nom/8.0.0/source/) |
| noop_proc_macro | 0.3.0 | MIT | [Package source](https://docs.rs/crate/noop_proc_macro/0.3.0/source/) |
| nu-ansi-term | 0.50.3 | MIT | [Package source](https://docs.rs/crate/nu-ansi-term/0.50.3/source/) |
| num | 0.4.3 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/num/0.4.3/source/) |
| num_cpus | 1.17.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/num_cpus/1.17.0/source/) |
| num_enum | 0.7.6 | BSD-3-Clause OR MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/num_enum/0.7.6/source/) |
| num_enum_derive | 0.7.6 | BSD-3-Clause OR MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/num_enum_derive/0.7.6/source/) |
| num-bigint | 0.4.8 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/num-bigint/0.4.8/source/) |
| num-bigint-dig | 0.8.6 | MIT/Apache-2.0 | [Package source](https://docs.rs/crate/num-bigint-dig/0.8.6/source/) |
| num-complex | 0.4.6 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/num-complex/0.4.6/source/) |
| num-conv | 0.2.2 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/num-conv/0.2.2/source/) |
| num-derive | 0.4.2 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/num-derive/0.4.2/source/) |
| num-integer | 0.1.47 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/num-integer/0.1.47/source/) |
| num-iter | 0.1.46 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/num-iter/0.1.46/source/) |
| num-rational | 0.4.2 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/num-rational/0.4.2/source/) |
| num-traits | 0.2.19 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/num-traits/0.2.19/source/) |
| objc2 | 0.6.5 | MIT | [Package source](https://docs.rs/crate/objc2/0.6.5/source/) |
| objc2-app-kit | 0.3.2 | Zlib OR Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/objc2-app-kit/0.3.2/source/) |
| objc2-cloud-kit | 0.3.2 | Zlib OR Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/objc2-cloud-kit/0.3.2/source/) |
| objc2-core-data | 0.3.2 | Zlib OR Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/objc2-core-data/0.3.2/source/) |
| objc2-core-foundation | 0.3.2 | Zlib OR Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/objc2-core-foundation/0.3.2/source/) |
| objc2-core-graphics | 0.3.2 | Zlib OR Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/objc2-core-graphics/0.3.2/source/) |
| objc2-core-image | 0.3.2 | Zlib OR Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/objc2-core-image/0.3.2/source/) |
| objc2-core-location | 0.3.2 | Zlib OR Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/objc2-core-location/0.3.2/source/) |
| objc2-core-text | 0.3.2 | Zlib OR Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/objc2-core-text/0.3.2/source/) |
| objc2-encode | 4.1.0 | MIT | [Package source](https://docs.rs/crate/objc2-encode/4.1.0/source/) |
| objc2-exception-helper | 0.1.1 | Zlib OR Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/objc2-exception-helper/0.1.1/source/) |
| objc2-foundation | 0.3.2 | MIT | [Package source](https://docs.rs/crate/objc2-foundation/0.3.2/source/) |
| objc2-io-surface | 0.3.2 | Zlib OR Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/objc2-io-surface/0.3.2/source/) |
| objc2-quartz-core | 0.3.2 | Zlib OR Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/objc2-quartz-core/0.3.2/source/) |
| objc2-ui-kit | 0.3.2 | Zlib OR Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/objc2-ui-kit/0.3.2/source/) |
| objc2-user-notifications | 0.3.2 | Zlib OR Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/objc2-user-notifications/0.3.2/source/) |
| objc2-web-kit | 0.3.2 | Zlib OR Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/objc2-web-kit/0.3.2/source/) |
| once_cell | 1.21.4 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/once_cell/1.21.4/source/) |
| oorandom | 11.1.5 | MIT | [Package source](https://docs.rs/crate/oorandom/11.1.5/source/) |
| open | 5.4.5 | MIT | [Package source](https://docs.rs/crate/open/5.4.5/source/) |
| openssl-probe | 0.2.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/openssl-probe/0.2.1/source/) |
| option-ext | 0.2.0 | MPL-2.0 | [Package source](https://docs.rs/crate/option-ext/0.2.0/source/) |
| ordered-stream | 0.2.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/ordered-stream/0.2.0/source/) |
| os_pipe | 1.2.3 | MIT | [Package source](https://docs.rs/crate/os_pipe/1.2.3/source/) |
| owned_ttf_parser | 0.25.1 | Apache-2.0 | [Package source](https://docs.rs/crate/owned_ttf_parser/0.25.1/source/) |
| pango | 0.18.3 | MIT | [Package source](https://docs.rs/crate/pango/0.18.3/source/) |
| pango-sys | 0.18.0 | MIT | [Package source](https://docs.rs/crate/pango-sys/0.18.0/source/) |
| parking | 2.2.1 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/parking/2.2.1/source/) |
| parking_lot | 0.12.5 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/parking_lot/0.12.5/source/) |
| parking_lot_core | 0.9.12 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/parking_lot_core/0.9.12/source/) |
| paste | 1.0.15 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/paste/1.0.15/source/) |
| pastey | 0.1.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/pastey/0.1.1/source/) |
| pathfinder_geometry | 0.5.1 | MIT/Apache-2.0 | [Package source](https://docs.rs/crate/pathfinder_geometry/0.5.1/source/) |
| pathfinder_simd | 0.5.6 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/pathfinder_simd/0.5.6/source/) |
| pem-rfc7468 | 0.7.0 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/pem-rfc7468/0.7.0/source/) |
| percent-encoding | 2.3.2 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/percent-encoding/2.3.2/source/) |
| phf | 0.13.1 | MIT | [Package source](https://docs.rs/crate/phf/0.13.1/source/) |
| phf_codegen | 0.13.1 | MIT | [Package source](https://docs.rs/crate/phf_codegen/0.13.1/source/) |
| phf_generator | 0.13.1 | MIT | [Package source](https://docs.rs/crate/phf_generator/0.13.1/source/) |
| phf_macros | 0.13.1 | MIT | [Package source](https://docs.rs/crate/phf_macros/0.13.1/source/) |
| phf_shared | 0.13.1 | MIT | [Package source](https://docs.rs/crate/phf_shared/0.13.1/source/) |
| pin-project-lite | 0.2.17 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/pin-project-lite/0.2.17/source/) |
| piper | 0.2.5 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/piper/0.2.5/source/) |
| pkcs1 | 0.7.5 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/pkcs1/0.7.5/source/) |
| pkcs8 | 0.10.2 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/pkcs8/0.10.2/source/) |
| pkg-config | 0.3.34 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/pkg-config/0.3.34/source/) |
| plain | 0.2.3 | MIT/Apache-2.0 | [Package source](https://docs.rs/crate/plain/0.2.3/source/) |
| plist | 1.10.3 | MIT | [Package source](https://docs.rs/crate/plist/1.10.3/source/) |
| png | 0.17.16 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/png/0.17.16/source/) |
| png | 0.18.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/png/0.18.1/source/) |
| polling | 3.11.0 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/polling/3.11.0/source/) |
| portable-atomic | 1.15.0 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/portable-atomic/1.15.0/source/) |
| portable-atomic-util | 0.2.8 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/portable-atomic-util/0.2.8/source/) |
| potential_utf | 0.1.6 | Unicode-3.0 | [Package source](https://docs.rs/crate/potential_utf/0.1.6/source/) |
| powerfmt | 0.2.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/powerfmt/0.2.1/source/) |
| ppv-lite86 | 0.2.21 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/ppv-lite86/0.2.21/source/) |
| precomputed-hash | 0.1.1 | MIT | [Package source](https://docs.rs/crate/precomputed-hash/0.1.1/source/) |
| proc-macro-crate | 1.3.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/proc-macro-crate/1.3.1/source/) |
| proc-macro-crate | 2.0.2 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/proc-macro-crate/2.0.2/source/) |
| proc-macro-crate | 3.5.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/proc-macro-crate/3.5.0/source/) |
| proc-macro-error | 1.0.4 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/proc-macro-error/1.0.4/source/) |
| proc-macro-error-attr | 1.0.4 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/proc-macro-error-attr/1.0.4/source/) |
| proc-macro2 | 1.0.107 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/proc-macro2/1.0.107/source/) |
| profiling | 1.0.18 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/profiling/1.0.18/source/) |
| profiling-procmacros | 1.0.18 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/profiling-procmacros/1.0.18/source/) |
| proptest | 1.12.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/proptest/1.12.0/source/) |
| pulp | 0.22.3 | MIT | [Package source](https://docs.rs/crate/pulp/0.22.3/source/) |
| pulp-wasm-simd-flag | 0.1.1 | MIT | [Package source](https://docs.rs/crate/pulp-wasm-simd-flag/0.1.1/source/) |
| pxfm | 0.1.30 | BSD-3-Clause OR Apache-2.0 | [Package source](https://docs.rs/crate/pxfm/0.1.30/source/) |
| qoi | 0.4.1 | MIT/Apache-2.0 | [Package source](https://docs.rs/crate/qoi/0.4.1/source/) |
| quick-error | 1.2.3 | MIT/Apache-2.0 | [Package source](https://docs.rs/crate/quick-error/1.2.3/source/) |
| quick-error | 2.0.1 | MIT/Apache-2.0 | [Package source](https://docs.rs/crate/quick-error/2.0.1/source/) |
| quick-xml | 0.42.0 | MIT | [Package source](https://docs.rs/crate/quick-xml/0.42.0/source/) |
| quinn | 0.11.12 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/quinn/0.11.12/source/) |
| quinn-proto | 0.11.19 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/quinn-proto/0.11.19/source/) |
| quinn-udp | 0.5.16 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/quinn-udp/0.5.16/source/) |
| quote | 1.0.47 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/quote/1.0.47/source/) |
| r-efi | 5.3.0 | MIT OR Apache-2.0 OR LGPL-2.1-or-later | [Package source](https://docs.rs/crate/r-efi/5.3.0/source/) |
| r-efi | 6.0.0 | MIT OR Apache-2.0 OR LGPL-2.1-or-later | [Package source](https://docs.rs/crate/r-efi/6.0.0/source/) |
| rand | 0.10.3 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/rand/0.10.3/source/) |
| rand | 0.8.8 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/rand/0.8.8/source/) |
| rand | 0.9.5 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/rand/0.9.5/source/) |
| rand_core | 0.10.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/rand_core/0.10.1/source/) |
| rand_core | 0.6.4 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/rand_core/0.6.4/source/) |
| rand_core | 0.9.5 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/rand_core/0.9.5/source/) |
| rand_distr | 0.4.3 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/rand_distr/0.4.3/source/) |
| rand_chacha | 0.3.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/rand_chacha/0.3.1/source/) |
| rand_chacha | 0.9.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/rand_chacha/0.9.0/source/) |
| rand_pcg | 0.10.2 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/rand_pcg/0.10.2/source/) |
| rand_xorshift | 0.5.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/rand_xorshift/0.5.0/source/) |
| rangemap | 1.8.0 | MIT/Apache-2.0 | [Package source](https://docs.rs/crate/rangemap/1.8.0/source/) |
| rav1e | 0.8.1 | BSD-2-Clause | [Package source](https://docs.rs/crate/rav1e/0.8.1/source/) |
| ravif | 0.13.0 | BSD-3-Clause | [Package source](https://docs.rs/crate/ravif/0.13.0/source/) |
| raw-cpuid | 11.6.0 | MIT | [Package source](https://docs.rs/crate/raw-cpuid/11.6.0/source/) |
| raw-window-handle | 0.6.2 | MIT OR Apache-2.0 OR Zlib | [Package source](https://docs.rs/crate/raw-window-handle/0.6.2/source/) |
| rawpointer | 0.2.1 | MIT/Apache-2.0 | [Package source](https://docs.rs/crate/rawpointer/0.2.1/source/) |
| rayon | 1.12.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/rayon/1.12.0/source/) |
| rayon-core | 1.13.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/rayon-core/1.13.0/source/) |
| reborrow | 0.5.5 | MIT | [Package source](https://docs.rs/crate/reborrow/0.5.5/source/) |
| redox_syscall | 0.5.18 | MIT | [Package source](https://docs.rs/crate/redox_syscall/0.5.18/source/) |
| redox_syscall | 0.9.5 | MIT | [Package source](https://docs.rs/crate/redox_syscall/0.9.5/source/) |
| redox_users | 0.4.6 | MIT | [Package source](https://docs.rs/crate/redox_users/0.4.6/source/) |
| redox_users | 0.5.3 | MIT | [Package source](https://docs.rs/crate/redox_users/0.5.3/source/) |
| ref-cast | 1.0.27 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/ref-cast/1.0.27/source/) |
| ref-cast-impl | 1.0.27 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/ref-cast-impl/1.0.27/source/) |
| regex | 1.13.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/regex/1.13.1/source/) |
| regex-automata | 0.4.18 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/regex-automata/0.4.18/source/) |
| regex-syntax | 0.8.11 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/regex-syntax/0.8.11/source/) |
| reqwest | 0.13.5 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/reqwest/0.13.5/source/) |
| rfd | 0.16.1 | MIT | [Package source](https://docs.rs/crate/rfd/0.16.1/source/) |
| rgb | 0.8.53 | MIT | [Package source](https://docs.rs/crate/rgb/0.8.53/source/) |
| ring | 0.17.14 | Apache-2.0 AND ISC | [Package source](https://docs.rs/crate/ring/0.17.14/source/) |
| rsa | 0.9.10 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/rsa/0.9.10/source/) |
| rustc_version | 0.4.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/rustc_version/0.4.1/source/) |
| rustc-hash | 2.1.3 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/rustc-hash/2.1.3/source/) |
| rustix | 1.1.5 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/rustix/1.1.5/source/) |
| rustls | 0.23.46 | Apache-2.0 OR ISC OR MIT | [Package source](https://docs.rs/crate/rustls/0.23.46/source/) |
| rustls-native-certs | 0.8.5 | Apache-2.0 OR ISC OR MIT | [Package source](https://docs.rs/crate/rustls-native-certs/0.8.5/source/) |
| rustls-pki-types | 1.15.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/rustls-pki-types/1.15.1/source/) |
| rustls-platform-verifier | 0.7.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/rustls-platform-verifier/0.7.1/source/) |
| rustls-platform-verifier-android | 0.2.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/rustls-platform-verifier-android/0.2.0/source/) |
| rustls-webpki | 0.103.16 | ISC | [Package source](https://docs.rs/crate/rustls-webpki/0.103.16/source/) |
| rustversion | 1.0.23 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/rustversion/1.0.23/source/) |
| rusty-fork | 0.3.1 | MIT/Apache-2.0 | [Package source](https://docs.rs/crate/rusty-fork/0.3.1/source/) |
| ryu | 1.0.23 | Apache-2.0 OR BSL-1.0 | [Package source](https://docs.rs/crate/ryu/1.0.23/source/) |
| safe_arch | 0.7.4 | Zlib OR Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/safe_arch/0.7.4/source/) |
| same-file | 1.0.6 | Unlicense/MIT | [Package source](https://docs.rs/crate/same-file/1.0.6/source/) |
| scopeguard | 1.2.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/scopeguard/1.2.0/source/) |
| security-framework | 3.7.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/security-framework/3.7.0/source/) |
| security-framework-sys | 2.17.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/security-framework-sys/2.17.0/source/) |
| selectors | 0.36.1 | MPL-2.0 | [Package source](https://docs.rs/crate/selectors/0.36.1/source/) |
| semver | 1.0.28 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/semver/1.0.28/source/) |
| serde | 1.0.229 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/serde/1.0.229/source/) |
| serde_core | 1.0.229 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/serde_core/1.0.229/source/) |
| serde_derive | 1.0.229 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/serde_derive/1.0.229/source/) |
| serde_derive_internals | 0.29.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/serde_derive_internals/0.29.1/source/) |
| serde_json | 1.0.154 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/serde_json/1.0.154/source/) |
| serde_repr | 0.1.21 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/serde_repr/0.1.21/source/) |
| serde_spanned | 0.6.9 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/serde_spanned/0.6.9/source/) |
| serde_spanned | 1.1.2 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/serde_spanned/1.1.2/source/) |
| serde_urlencoded | 0.7.1 | MIT/Apache-2.0 | [Package source](https://docs.rs/crate/serde_urlencoded/0.7.1/source/) |
| serde_with | 3.24.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/serde_with/3.24.0/source/) |
| serde_with_macros | 3.24.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/serde_with_macros/3.24.0/source/) |
| serde-untagged | 0.1.9 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/serde-untagged/0.1.9/source/) |
| serialize-to-javascript | 0.1.2 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/serialize-to-javascript/0.1.2/source/) |
| serialize-to-javascript-impl | 0.1.2 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/serialize-to-javascript-impl/0.1.2/source/) |
| servo_arc | 0.4.3 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/servo_arc/0.4.3/source/) |
| sha1 | 0.10.7 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/sha1/0.10.7/source/) |
| sha2 | 0.10.9 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/sha2/0.10.9/source/) |
| sha2 | 0.11.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/sha2/0.11.1/source/) |
| sharded-slab | 0.1.7 | MIT | [Package source](https://docs.rs/crate/sharded-slab/0.1.7/source/) |
| shared_child | 1.1.2 | MIT | [Package source](https://docs.rs/crate/shared_child/1.1.2/source/) |
| shlex | 1.3.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/shlex/1.3.0/source/) |
| schannel | 0.1.30 | MIT | [Package source](https://docs.rs/crate/schannel/0.1.30/source/) |
| schemars | 0.8.22 | MIT | [Package source](https://docs.rs/crate/schemars/0.8.22/source/) |
| schemars | 0.9.0 | MIT | [Package source](https://docs.rs/crate/schemars/0.9.0/source/) |
| schemars | 1.2.3 | MIT | [Package source](https://docs.rs/crate/schemars/1.2.3/source/) |
| schemars_derive | 0.8.22 | MIT | [Package source](https://docs.rs/crate/schemars_derive/0.8.22/source/) |
| sigchld | 0.2.5 | MIT | [Package source](https://docs.rs/crate/sigchld/0.2.5/source/) |
| signal-hook | 0.4.5 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/signal-hook/0.4.5/source/) |
| signal-hook-registry | 1.4.8 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/signal-hook-registry/1.4.8/source/) |
| signature | 2.2.0 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/signature/2.2.0/source/) |
| simba | 0.8.1 | Apache-2.0 | [Package source](https://docs.rs/crate/simba/0.8.1/source/) |
| simd_cesu8 | 1.2.0 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/simd_cesu8/1.2.0/source/) |
| simd_helpers | 0.1.0 | MIT | [Package source](https://docs.rs/crate/simd_helpers/0.1.0/source/) |
| simd-adler32 | 0.3.10 | MIT | [Package source](https://docs.rs/crate/simd-adler32/0.3.10/source/) |
| simdutf8 | 0.1.5 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/simdutf8/0.1.5/source/) |
| similar | 2.7.0 | Apache-2.0 | [Package source](https://docs.rs/crate/similar/2.7.0/source/) |
| siphasher | 1.0.4 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/siphasher/1.0.4/source/) |
| slab | 0.4.12 | MIT | [Package source](https://docs.rs/crate/slab/0.4.12/source/) |
| smallvec | 1.16.4 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/smallvec/1.16.4/source/) |
| socket2 | 0.6.5 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/socket2/0.6.5/source/) |
| softbuffer | 0.4.8 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/softbuffer/0.4.8/source/) |
| soup3 | 0.5.0 | MIT | [Package source](https://docs.rs/crate/soup3/0.5.0/source/) |
| soup3-sys | 0.5.0 | MIT | [Package source](https://docs.rs/crate/soup3-sys/0.5.0/source/) |
| specta | 2.0.0-rc.25 | MIT | [Package source](https://docs.rs/crate/specta/2.0.0-rc.25/source/) |
| specta-macros | 2.0.0-rc.25 | MIT | [Package source](https://docs.rs/crate/specta-macros/2.0.0-rc.25/source/) |
| specta-serde | 0.0.12 | MIT | [Package source](https://docs.rs/crate/specta-serde/0.0.12/source/) |
| specta-typescript | 0.0.12 | MIT | [Package source](https://docs.rs/crate/specta-typescript/0.0.12/source/) |
| specta-util | 0.0.12 | MIT | [Package source](https://docs.rs/crate/specta-util/0.0.12/source/) |
| spin | 0.9.9 | MIT | [Package source](https://docs.rs/crate/spin/0.9.9/source/) |
| spki | 0.7.3 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/spki/0.7.3/source/) |
| sqlx | 0.8.6 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/sqlx/0.8.6/source/) |
| sqlx-core | 0.8.6 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/sqlx-core/0.8.6/source/) |
| sqlx-macros | 0.8.6 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/sqlx-macros/0.8.6/source/) |
| sqlx-macros-core | 0.8.6 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/sqlx-macros-core/0.8.6/source/) |
| sqlx-mysql | 0.8.6 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/sqlx-mysql/0.8.6/source/) |
| sqlx-postgres | 0.8.6 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/sqlx-postgres/0.8.6/source/) |
| sqlx-sqlite | 0.8.6 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/sqlx-sqlite/0.8.6/source/) |
| stable_deref_trait | 1.2.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/stable_deref_trait/1.2.1/source/) |
| string_cache | 0.9.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/string_cache/0.9.0/source/) |
| string_cache_codegen | 0.6.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/string_cache_codegen/0.6.1/source/) |
| stringprep | 0.1.5 | MIT/Apache-2.0 | [Package source](https://docs.rs/crate/stringprep/0.1.5/source/) |
| strsim | 0.11.1 | MIT | [Package source](https://docs.rs/crate/strsim/0.11.1/source/) |
| subtle | 2.6.1 | BSD-3-Clause | [Package source](https://docs.rs/crate/subtle/2.6.1/source/) |
| swift-rs | 1.0.9 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/swift-rs/1.0.9/source/) |
| symlink | 0.1.0 | MIT/Apache-2.0 | [Package source](https://docs.rs/crate/symlink/0.1.0/source/) |
| syn | 1.0.109 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/syn/1.0.109/source/) |
| syn | 2.0.119 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/syn/2.0.119/source/) |
| syn | 3.0.9 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/syn/3.0.9/source/) |
| sync_wrapper | 1.0.2 | Apache-2.0 | [Package source](https://docs.rs/crate/sync_wrapper/1.0.2/source/) |
| synstructure | 0.14.0 | MIT | [Package source](https://docs.rs/crate/synstructure/0.14.0/source/) |
| system-deps | 6.2.2 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/system-deps/6.2.2/source/) |
| tao | 0.35.3 | Apache-2.0 | [Package source](https://docs.rs/crate/tao/0.35.3/source/) |
| tao-macros | 0.1.4 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/tao-macros/0.1.4/source/) |
| target-lexicon | 0.12.16 | Apache-2.0 WITH LLVM-exception | [Package source](https://docs.rs/crate/target-lexicon/0.12.16/source/) |
| tauri | 2.11.6 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/tauri/2.11.6/source/) |
| tauri-build | 2.6.3 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/tauri-build/2.6.3/source/) |
| tauri-codegen | 2.6.3 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/tauri-codegen/2.6.3/source/) |
| tauri-macros | 2.6.3 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/tauri-macros/2.6.3/source/) |
| tauri-plugin | 2.6.3 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/tauri-plugin/2.6.3/source/) |
| tauri-plugin-dialog | 2.7.3 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/tauri-plugin-dialog/2.7.3/source/) |
| tauri-plugin-fs | 2.5.2 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/tauri-plugin-fs/2.5.2/source/) |
| tauri-plugin-opener | 2.5.4 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/tauri-plugin-opener/2.5.4/source/) |
| tauri-plugin-shell | 2.3.6 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/tauri-plugin-shell/2.3.6/source/) |
| tauri-plugin-single-instance | 2.4.3 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/tauri-plugin-single-instance/2.4.3/source/) |
| tauri-runtime | 2.11.3 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/tauri-runtime/2.11.3/source/) |
| tauri-runtime-wry | 2.11.4 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/tauri-runtime-wry/2.11.4/source/) |
| tauri-specta | 2.0.0-rc.25 | MIT | [Package source](https://docs.rs/crate/tauri-specta/2.0.0-rc.25/source/) |
| tauri-specta-macros | 2.0.0-rc.25 | MIT | [Package source](https://docs.rs/crate/tauri-specta-macros/2.0.0-rc.25/source/) |
| tauri-utils | 2.9.3 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/tauri-utils/2.9.3/source/) |
| tauri-winres | 0.3.7 | MIT | [Package source](https://docs.rs/crate/tauri-winres/0.3.7/source/) |
| tempfile | 3.27.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/tempfile/3.27.0/source/) |
| tendril | 0.5.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/tendril/0.5.1/source/) |
| thiserror | 1.0.69 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/thiserror/1.0.69/source/) |
| thiserror | 2.0.21 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/thiserror/2.0.21/source/) |
| thiserror-impl | 1.0.69 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/thiserror-impl/1.0.69/source/) |
| thiserror-impl | 2.0.21 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/thiserror-impl/2.0.21/source/) |
| thread_local | 1.1.10 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/thread_local/1.1.10/source/) |
| tiff | 0.11.3 | MIT | [Package source](https://docs.rs/crate/tiff/0.11.3/source/) |
| time | 0.3.55 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/time/0.3.55/source/) |
| time-core | 0.1.9 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/time-core/0.1.9/source/) |
| time-macros | 0.2.32 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/time-macros/0.2.32/source/) |
| tinystr | 0.8.5 | Unicode-3.0 | [Package source](https://docs.rs/crate/tinystr/0.8.5/source/) |
| tinytemplate | 1.2.1 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/tinytemplate/1.2.1/source/) |
| tinyvec | 1.13.3 | Zlib OR Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/tinyvec/1.13.3/source/) |
| tokio | 1.54.1 | MIT | [Package source](https://docs.rs/crate/tokio/1.54.1/source/) |
| tokio-macros | 2.7.2 | MIT | [Package source](https://docs.rs/crate/tokio-macros/2.7.2/source/) |
| tokio-rustls | 0.26.6 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/tokio-rustls/0.26.6/source/) |
| tokio-stream | 0.1.19 | MIT | [Package source](https://docs.rs/crate/tokio-stream/0.1.19/source/) |
| tokio-util | 0.7.20 | MIT | [Package source](https://docs.rs/crate/tokio-util/0.7.20/source/) |
| toml | 0.8.2 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/toml/0.8.2/source/) |
| toml | 0.9.12+spec-1.1.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/toml/0.9.12+spec-1.1.0/source/) |
| toml | 1.1.8+spec-1.1.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/toml/1.1.8+spec-1.1.0/source/) |
| toml_datetime | 0.6.3 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/toml_datetime/0.6.3/source/) |
| toml_datetime | 0.7.5+spec-1.1.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/toml_datetime/0.7.5+spec-1.1.0/source/) |
| toml_datetime | 1.1.2+spec-1.1.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/toml_datetime/1.1.2+spec-1.1.0/source/) |
| toml_edit | 0.19.15 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/toml_edit/0.19.15/source/) |
| toml_edit | 0.20.2 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/toml_edit/0.20.2/source/) |
| toml_edit | 0.25.17+spec-1.1.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/toml_edit/0.25.17+spec-1.1.0/source/) |
| toml_parser | 1.1.5+spec-1.1.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/toml_parser/1.1.5+spec-1.1.0/source/) |
| toml_writer | 1.1.3+spec-1.1.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/toml_writer/1.1.3+spec-1.1.0/source/) |
| tower | 0.5.3 | MIT | [Package source](https://docs.rs/crate/tower/0.5.3/source/) |
| tower-http | 0.6.11 | MIT | [Package source](https://docs.rs/crate/tower-http/0.6.11/source/) |
| tower-layer | 0.3.3 | MIT | [Package source](https://docs.rs/crate/tower-layer/0.3.3/source/) |
| tower-service | 0.3.3 | MIT | [Package source](https://docs.rs/crate/tower-service/0.3.3/source/) |
| tracing | 0.1.44 | MIT | [Package source](https://docs.rs/crate/tracing/0.1.44/source/) |
| tracing-appender | 0.2.5 | MIT | [Package source](https://docs.rs/crate/tracing-appender/0.2.5/source/) |
| tracing-attributes | 0.1.31 | MIT | [Package source](https://docs.rs/crate/tracing-attributes/0.1.31/source/) |
| tracing-core | 0.1.36 | MIT | [Package source](https://docs.rs/crate/tracing-core/0.1.36/source/) |
| tracing-log | 0.2.0 | MIT | [Package source](https://docs.rs/crate/tracing-log/0.2.0/source/) |
| tracing-serde | 0.2.0 | MIT | [Package source](https://docs.rs/crate/tracing-serde/0.2.0/source/) |
| tracing-subscriber | 0.3.23 | MIT | [Package source](https://docs.rs/crate/tracing-subscriber/0.3.23/source/) |
| tray-icon | 0.24.2 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/tray-icon/0.24.2/source/) |
| try-lock | 0.2.5 | MIT | [Package source](https://docs.rs/crate/try-lock/0.2.5/source/) |
| ttf-parser | 0.24.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/ttf-parser/0.24.1/source/) |
| ttf-parser | 0.25.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/ttf-parser/0.25.1/source/) |
| typeid | 1.0.3 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/typeid/1.0.3/source/) |
| typenum | 1.20.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/typenum/1.20.1/source/) |
| uds_windows | 1.2.1 | MIT | [Package source](https://docs.rs/crate/uds_windows/1.2.1/source/) |
| unarray | 0.1.4 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/unarray/0.1.4/source/) |
| unic-common | 0.9.0 | MIT/Apache-2.0 | [Package source](https://docs.rs/crate/unic-common/0.9.0/source/) |
| unic-char-property | 0.9.0 | MIT/Apache-2.0 | [Package source](https://docs.rs/crate/unic-char-property/0.9.0/source/) |
| unic-char-range | 0.9.0 | MIT/Apache-2.0 | [Package source](https://docs.rs/crate/unic-char-range/0.9.0/source/) |
| unic-ucd-ident | 0.9.0 | MIT/Apache-2.0 | [Package source](https://docs.rs/crate/unic-ucd-ident/0.9.0/source/) |
| unic-ucd-version | 0.9.0 | MIT/Apache-2.0 | [Package source](https://docs.rs/crate/unic-ucd-version/0.9.0/source/) |
| unicode-bidi | 0.3.18 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/unicode-bidi/0.3.18/source/) |
| unicode-ident | 1.0.27 | (MIT OR Apache-2.0) AND Unicode-3.0 | [Package source](https://docs.rs/crate/unicode-ident/1.0.27/source/) |
| unicode-normalization | 0.1.26 | (MIT OR Apache-2.0) AND Unicode-3.0 | [Package source](https://docs.rs/crate/unicode-normalization/0.1.26/source/) |
| unicode-properties | 0.1.4 | MIT/Apache-2.0 | [Package source](https://docs.rs/crate/unicode-properties/0.1.4/source/) |
| unicode-segmentation | 1.13.3 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/unicode-segmentation/1.13.3/source/) |
| untrusted | 0.9.0 | ISC | [Package source](https://docs.rs/crate/untrusted/0.9.0/source/) |
| url | 2.5.8 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/url/2.5.8/source/) |
| urlpattern | 0.3.0 | MIT | [Package source](https://docs.rs/crate/urlpattern/0.3.0/source/) |
| utf8_iter | 1.0.4 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/utf8_iter/1.0.4/source/) |
| uuid | 1.29.0 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/uuid/1.29.0/source/) |
| v_frame | 0.3.9 | BSD-2-Clause | [Package source](https://docs.rs/crate/v_frame/0.3.9/source/) |
| valuable | 0.1.1 | MIT | [Package source](https://docs.rs/crate/valuable/0.1.1/source/) |
| vcpkg | 0.2.15 | MIT/Apache-2.0 | [Package source](https://docs.rs/crate/vcpkg/0.2.15/source/) |
| version_check | 0.9.5 | MIT/Apache-2.0 | [Package source](https://docs.rs/crate/version_check/0.9.5/source/) |
| version-compare | 0.2.1 | MIT | [Package source](https://docs.rs/crate/version-compare/0.2.1/source/) |
| vswhom | 0.1.0 | MIT | [Package source](https://docs.rs/crate/vswhom/0.1.0/source/) |
| vswhom-sys | 0.1.3 | MIT | [Package source](https://docs.rs/crate/vswhom-sys/0.1.3/source/) |
| wait-timeout | 0.2.1 | MIT/Apache-2.0 | [Package source](https://docs.rs/crate/wait-timeout/0.2.1/source/) |
| walkdir | 2.5.0 | Unlicense/MIT | [Package source](https://docs.rs/crate/walkdir/2.5.0/source/) |
| want | 0.3.2 | MIT | [Package source](https://docs.rs/crate/want/0.3.2/source/) |
| wasi | 0.11.1+wasi-snapshot-preview1 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/wasi/0.11.1+wasi-snapshot-preview1/source/) |
| wasip2 | 1.0.4+wasi-0.2.12 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/wasip2/1.0.4+wasi-0.2.12/source/) |
| wasite | 0.1.0 | Apache-2.0 OR BSL-1.0 OR MIT | [Package source](https://docs.rs/crate/wasite/0.1.0/source/) |
| wasm-bindgen | 0.2.129 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/wasm-bindgen/0.2.129/source/) |
| wasm-bindgen-futures | 0.4.79 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/wasm-bindgen-futures/0.4.79/source/) |
| wasm-bindgen-macro | 0.2.129 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/wasm-bindgen-macro/0.2.129/source/) |
| wasm-bindgen-macro-support | 0.2.129 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/wasm-bindgen-macro-support/0.2.129/source/) |
| wasm-bindgen-shared | 0.2.129 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/wasm-bindgen-shared/0.2.129/source/) |
| wasm-streams | 0.5.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/wasm-streams/0.5.0/source/) |
| web_atoms | 0.2.6 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/web_atoms/0.2.6/source/) |
| web-sys | 0.3.106 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/web-sys/0.3.106/source/) |
| web-time | 1.1.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/web-time/1.1.0/source/) |
| webkit2gtk | 2.0.2 | MIT | [Package source](https://docs.rs/crate/webkit2gtk/2.0.2/source/) |
| webkit2gtk-sys | 2.0.2 | MIT | [Package source](https://docs.rs/crate/webkit2gtk-sys/2.0.2/source/) |
| webpki-root-certs | 1.0.11 | CDLA-Permissive-2.0 | [Package source](https://docs.rs/crate/webpki-root-certs/1.0.11/source/) |
| webview2-com | 0.38.2 | MIT | [Package source](https://docs.rs/crate/webview2-com/0.38.2/source/) |
| webview2-com-macros | 0.8.1 | MIT | [Package source](https://docs.rs/crate/webview2-com-macros/0.8.1/source/) |
| webview2-com-sys | 0.38.2 | MIT | [Package source](https://docs.rs/crate/webview2-com-sys/0.38.2/source/) |
| weezl | 0.1.12 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/weezl/0.1.12/source/) |
| weezl | 0.2.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/weezl/0.2.1/source/) |
| whoami | 1.6.1 | Apache-2.0 OR BSL-1.0 OR MIT | [Package source](https://docs.rs/crate/whoami/1.6.1/source/) |
| wide | 0.7.33 | Zlib OR Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/wide/0.7.33/source/) |
| winapi | 0.3.9 | MIT/Apache-2.0 | [Package source](https://docs.rs/crate/winapi/0.3.9/source/) |
| winapi-i686-pc-windows-gnu | 0.4.0 | MIT/Apache-2.0 | [Package source](https://docs.rs/crate/winapi-i686-pc-windows-gnu/0.4.0/source/) |
| winapi-util | 0.1.11 | Unlicense OR MIT | [Package source](https://docs.rs/crate/winapi-util/0.1.11/source/) |
| winapi-x86_64-pc-windows-gnu | 0.4.0 | MIT/Apache-2.0 | [Package source](https://docs.rs/crate/winapi-x86_64-pc-windows-gnu/0.4.0/source/) |
| window-vibrancy | 0.6.0 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/window-vibrancy/0.6.0/source/) |
| windows | 0.59.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows/0.59.0/source/) |
| windows | 0.61.3 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows/0.61.3/source/) |
| windows_aarch64_gnullvm | 0.42.2 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows_aarch64_gnullvm/0.42.2/source/) |
| windows_aarch64_gnullvm | 0.48.5 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows_aarch64_gnullvm/0.48.5/source/) |
| windows_aarch64_gnullvm | 0.52.6 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows_aarch64_gnullvm/0.52.6/source/) |
| windows_aarch64_gnullvm | 0.53.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows_aarch64_gnullvm/0.53.1/source/) |
| windows_aarch64_msvc | 0.42.2 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows_aarch64_msvc/0.42.2/source/) |
| windows_aarch64_msvc | 0.48.5 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows_aarch64_msvc/0.48.5/source/) |
| windows_aarch64_msvc | 0.52.6 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows_aarch64_msvc/0.52.6/source/) |
| windows_aarch64_msvc | 0.53.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows_aarch64_msvc/0.53.1/source/) |
| windows_i686_gnu | 0.42.2 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows_i686_gnu/0.42.2/source/) |
| windows_i686_gnu | 0.48.5 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows_i686_gnu/0.48.5/source/) |
| windows_i686_gnu | 0.52.6 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows_i686_gnu/0.52.6/source/) |
| windows_i686_gnu | 0.53.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows_i686_gnu/0.53.1/source/) |
| windows_i686_gnullvm | 0.52.6 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows_i686_gnullvm/0.52.6/source/) |
| windows_i686_gnullvm | 0.53.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows_i686_gnullvm/0.53.1/source/) |
| windows_i686_msvc | 0.42.2 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows_i686_msvc/0.42.2/source/) |
| windows_i686_msvc | 0.48.5 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows_i686_msvc/0.48.5/source/) |
| windows_i686_msvc | 0.52.6 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows_i686_msvc/0.52.6/source/) |
| windows_i686_msvc | 0.53.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows_i686_msvc/0.53.1/source/) |
| windows_x86_64_gnu | 0.42.2 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows_x86_64_gnu/0.42.2/source/) |
| windows_x86_64_gnu | 0.48.5 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows_x86_64_gnu/0.48.5/source/) |
| windows_x86_64_gnu | 0.52.6 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows_x86_64_gnu/0.52.6/source/) |
| windows_x86_64_gnu | 0.53.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows_x86_64_gnu/0.53.1/source/) |
| windows_x86_64_gnullvm | 0.42.2 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows_x86_64_gnullvm/0.42.2/source/) |
| windows_x86_64_gnullvm | 0.48.5 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows_x86_64_gnullvm/0.48.5/source/) |
| windows_x86_64_gnullvm | 0.52.6 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows_x86_64_gnullvm/0.52.6/source/) |
| windows_x86_64_gnullvm | 0.53.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows_x86_64_gnullvm/0.53.1/source/) |
| windows_x86_64_msvc | 0.42.2 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows_x86_64_msvc/0.42.2/source/) |
| windows_x86_64_msvc | 0.48.5 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows_x86_64_msvc/0.48.5/source/) |
| windows_x86_64_msvc | 0.52.6 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows_x86_64_msvc/0.52.6/source/) |
| windows_x86_64_msvc | 0.53.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows_x86_64_msvc/0.53.1/source/) |
| windows-collections | 0.2.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows-collections/0.2.0/source/) |
| windows-core | 0.59.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows-core/0.59.0/source/) |
| windows-core | 0.61.2 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows-core/0.61.2/source/) |
| windows-core | 0.62.2 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows-core/0.62.2/source/) |
| windows-future | 0.2.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows-future/0.2.1/source/) |
| windows-implement | 0.59.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows-implement/0.59.0/source/) |
| windows-implement | 0.60.2 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows-implement/0.60.2/source/) |
| windows-interface | 0.59.3 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows-interface/0.59.3/source/) |
| windows-link | 0.1.3 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows-link/0.1.3/source/) |
| windows-link | 0.2.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows-link/0.2.1/source/) |
| windows-numerics | 0.2.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows-numerics/0.2.0/source/) |
| windows-result | 0.3.4 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows-result/0.3.4/source/) |
| windows-result | 0.4.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows-result/0.4.1/source/) |
| windows-strings | 0.3.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows-strings/0.3.1/source/) |
| windows-strings | 0.4.2 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows-strings/0.4.2/source/) |
| windows-strings | 0.5.1 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows-strings/0.5.1/source/) |
| windows-sys | 0.45.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows-sys/0.45.0/source/) |
| windows-sys | 0.48.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows-sys/0.48.0/source/) |
| windows-sys | 0.52.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows-sys/0.52.0/source/) |
| windows-sys | 0.59.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows-sys/0.59.0/source/) |
| windows-sys | 0.60.2 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows-sys/0.60.2/source/) |
| windows-sys | 0.61.2 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows-sys/0.61.2/source/) |
| windows-targets | 0.42.2 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows-targets/0.42.2/source/) |
| windows-targets | 0.48.5 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows-targets/0.48.5/source/) |
| windows-targets | 0.52.6 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows-targets/0.52.6/source/) |
| windows-targets | 0.53.5 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows-targets/0.53.5/source/) |
| windows-threading | 0.1.0 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows-threading/0.1.0/source/) |
| windows-version | 0.1.7 | MIT OR Apache-2.0 | [Package source](https://docs.rs/crate/windows-version/0.1.7/source/) |
| winnow | 0.5.40 | MIT | [Package source](https://docs.rs/crate/winnow/0.5.40/source/) |
| winnow | 0.7.15 | MIT | [Package source](https://docs.rs/crate/winnow/0.7.15/source/) |
| winnow | 1.0.4 | MIT | [Package source](https://docs.rs/crate/winnow/1.0.4/source/) |
| winreg | 0.56.0 | MIT | [Package source](https://docs.rs/crate/winreg/0.56.0/source/) |
| wio | 0.2.2 | MIT/Apache-2.0 | [Package source](https://docs.rs/crate/wio/0.2.2/source/) |
| wit-bindgen | 0.57.1 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/wit-bindgen/0.57.1/source/) |
| writeable | 0.6.4 | Unicode-3.0 | [Package source](https://docs.rs/crate/writeable/0.6.4/source/) |
| wry | 0.55.1 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/wry/0.55.1/source/) |
| x11 | 2.21.0 | MIT | [Package source](https://docs.rs/crate/x11/2.21.0/source/) |
| x11-dl | 2.21.0 | MIT | [Package source](https://docs.rs/crate/x11-dl/2.21.0/source/) |
| y4m | 0.8.0 | MIT | [Package source](https://docs.rs/crate/y4m/0.8.0/source/) |
| yeslogic-fontconfig-sys | 6.0.1 | MIT | [Package source](https://docs.rs/crate/yeslogic-fontconfig-sys/6.0.1/source/) |
| yoke | 0.8.4 | Unicode-3.0 | [Package source](https://docs.rs/crate/yoke/0.8.4/source/) |
| yoke-derive | 0.8.4 | Unicode-3.0 | [Package source](https://docs.rs/crate/yoke-derive/0.8.4/source/) |
| zbus | 5.19.0 | MIT | [Package source](https://docs.rs/crate/zbus/5.19.0/source/) |
| zbus_macros | 5.19.0 | MIT | [Package source](https://docs.rs/crate/zbus_macros/5.19.0/source/) |
| zbus_names | 4.3.5 | MIT | [Package source](https://docs.rs/crate/zbus_names/4.3.5/source/) |
| zerocopy | 0.8.63 | BSD-2-Clause OR Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/zerocopy/0.8.63/source/) |
| zerocopy-derive | 0.8.63 | BSD-2-Clause OR Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/zerocopy-derive/0.8.63/source/) |
| zerofrom | 0.1.8 | Unicode-3.0 | [Package source](https://docs.rs/crate/zerofrom/0.1.8/source/) |
| zerofrom-derive | 0.1.8 | Unicode-3.0 | [Package source](https://docs.rs/crate/zerofrom-derive/0.1.8/source/) |
| zeroize | 1.9.1 | Apache-2.0 OR MIT | [Package source](https://docs.rs/crate/zeroize/1.9.1/source/) |
| zerotrie | 0.2.5 | Unicode-3.0 | [Package source](https://docs.rs/crate/zerotrie/0.2.5/source/) |
| zerovec | 0.11.9 | Unicode-3.0 | [Package source](https://docs.rs/crate/zerovec/0.11.9/source/) |
| zerovec-derive | 0.11.7 | Unicode-3.0 | [Package source](https://docs.rs/crate/zerovec-derive/0.11.7/source/) |
| zcheapstr | 1.1.0 | MIT | [Package source](https://docs.rs/crate/zcheapstr/1.1.0/source/) |
| zlib-rs | 0.6.8 | Zlib | [Package source](https://docs.rs/crate/zlib-rs/0.6.8/source/) |
| zmij | 1.0.23 | MIT | [Package source](https://docs.rs/crate/zmij/1.0.23/source/) |
| zune-core | 0.5.3 | MIT OR Apache-2.0 OR Zlib | [Package source](https://docs.rs/crate/zune-core/0.5.3/source/) |
| zune-inflate | 0.2.54 | MIT OR Apache-2.0 OR Zlib | [Package source](https://docs.rs/crate/zune-inflate/0.2.54/source/) |
| zune-jpeg | 0.5.15 | MIT OR Apache-2.0 OR Zlib | [Package source](https://docs.rs/crate/zune-jpeg/0.5.15/source/) |
| zvariant | 5.15.1 | MIT | [Package source](https://docs.rs/crate/zvariant/5.15.1/source/) |
| zvariant_derive | 5.15.1 | MIT | [Package source](https://docs.rs/crate/zvariant_derive/5.15.1/source/) |
| zvariant_utils | 4.2.0 | MIT | [Package source](https://docs.rs/crate/zvariant_utils/4.2.0/source/) |

### JavaScript packages

Declared licences from installed pnpm package manifests. Includes build and
test dependencies as a conservative superset. npm tarballs include the licence
texts; runtime code is bundled, development tools are not shipped as programs.

| Package | Version | Declared licence | Licence texts / source |
|---|---|---|---|
| @adobe/css-tools | 4.4.4 | MIT | [npm source archive](https://registry.npmjs.org/@adobe/css-tools/-/css-tools-4.4.4.tgz) |
| @asamuzakjp/css-color | 5.1.11 | MIT | [npm source archive](https://registry.npmjs.org/@asamuzakjp/css-color/-/css-color-5.1.11.tgz) |
| @asamuzakjp/dom-selector | 7.1.1 | MIT | [npm source archive](https://registry.npmjs.org/@asamuzakjp/dom-selector/-/dom-selector-7.1.1.tgz) |
| @asamuzakjp/generational-cache | 1.0.1 | MIT | [npm source archive](https://registry.npmjs.org/@asamuzakjp/generational-cache/-/generational-cache-1.0.1.tgz) |
| @asamuzakjp/nwsapi | 2.3.9 | MIT | [npm source archive](https://registry.npmjs.org/@asamuzakjp/nwsapi/-/nwsapi-2.3.9.tgz) |
| @babel/code-frame | 7.29.0 | MIT | [npm source archive](https://registry.npmjs.org/@babel/code-frame/-/code-frame-7.29.0.tgz) |
| @babel/compat-data | 7.29.3 | MIT | [npm source archive](https://registry.npmjs.org/@babel/compat-data/-/compat-data-7.29.3.tgz) |
| @babel/core | 7.29.0 | MIT | [npm source archive](https://registry.npmjs.org/@babel/core/-/core-7.29.0.tgz) |
| @babel/generator | 7.29.1 | MIT | [npm source archive](https://registry.npmjs.org/@babel/generator/-/generator-7.29.1.tgz) |
| @babel/helper-compilation-targets | 7.28.6 | MIT | [npm source archive](https://registry.npmjs.org/@babel/helper-compilation-targets/-/helper-compilation-targets-7.28.6.tgz) |
| @babel/helper-globals | 7.28.0 | MIT | [npm source archive](https://registry.npmjs.org/@babel/helper-globals/-/helper-globals-7.28.0.tgz) |
| @babel/helper-module-imports | 7.28.6 | MIT | [npm source archive](https://registry.npmjs.org/@babel/helper-module-imports/-/helper-module-imports-7.28.6.tgz) |
| @babel/helper-module-transforms | 7.28.6 | MIT | [npm source archive](https://registry.npmjs.org/@babel/helper-module-transforms/-/helper-module-transforms-7.28.6.tgz) |
| @babel/helper-plugin-utils | 7.28.6 | MIT | [npm source archive](https://registry.npmjs.org/@babel/helper-plugin-utils/-/helper-plugin-utils-7.28.6.tgz) |
| @babel/helper-string-parser | 7.27.1 | MIT | [npm source archive](https://registry.npmjs.org/@babel/helper-string-parser/-/helper-string-parser-7.27.1.tgz) |
| @babel/helper-validator-identifier | 7.28.5 | MIT | [npm source archive](https://registry.npmjs.org/@babel/helper-validator-identifier/-/helper-validator-identifier-7.28.5.tgz) |
| @babel/helper-validator-option | 7.27.1 | MIT | [npm source archive](https://registry.npmjs.org/@babel/helper-validator-option/-/helper-validator-option-7.27.1.tgz) |
| @babel/helpers | 7.29.2 | MIT | [npm source archive](https://registry.npmjs.org/@babel/helpers/-/helpers-7.29.2.tgz) |
| @babel/parser | 7.29.3 | MIT | [npm source archive](https://registry.npmjs.org/@babel/parser/-/parser-7.29.3.tgz) |
| @babel/plugin-syntax-jsx | 7.28.6 | MIT | [npm source archive](https://registry.npmjs.org/@babel/plugin-syntax-jsx/-/plugin-syntax-jsx-7.28.6.tgz) |
| @babel/plugin-syntax-typescript | 7.28.6 | MIT | [npm source archive](https://registry.npmjs.org/@babel/plugin-syntax-typescript/-/plugin-syntax-typescript-7.28.6.tgz) |
| @babel/plugin-transform-react-jsx-self | 7.27.1 | MIT | [npm source archive](https://registry.npmjs.org/@babel/plugin-transform-react-jsx-self/-/plugin-transform-react-jsx-self-7.27.1.tgz) |
| @babel/plugin-transform-react-jsx-source | 7.27.1 | MIT | [npm source archive](https://registry.npmjs.org/@babel/plugin-transform-react-jsx-source/-/plugin-transform-react-jsx-source-7.27.1.tgz) |
| @babel/runtime | 7.29.2 | MIT | [npm source archive](https://registry.npmjs.org/@babel/runtime/-/runtime-7.29.2.tgz) |
| @babel/template | 7.28.6 | MIT | [npm source archive](https://registry.npmjs.org/@babel/template/-/template-7.28.6.tgz) |
| @babel/traverse | 7.29.0 | MIT | [npm source archive](https://registry.npmjs.org/@babel/traverse/-/traverse-7.29.0.tgz) |
| @babel/types | 7.29.0 | MIT | [npm source archive](https://registry.npmjs.org/@babel/types/-/types-7.29.0.tgz) |
| @bramus/specificity | 2.4.2 | MIT | [npm source archive](https://registry.npmjs.org/@bramus/specificity/-/specificity-2.4.2.tgz) |
| @csstools/color-helpers | 6.0.2 | MIT-0 | [npm source archive](https://registry.npmjs.org/@csstools/color-helpers/-/color-helpers-6.0.2.tgz) |
| @csstools/css-calc | 3.2.0 | MIT | [npm source archive](https://registry.npmjs.org/@csstools/css-calc/-/css-calc-3.2.0.tgz) |
| @csstools/css-color-parser | 4.1.0 | MIT | [npm source archive](https://registry.npmjs.org/@csstools/css-color-parser/-/css-color-parser-4.1.0.tgz) |
| @csstools/css-parser-algorithms | 4.0.0 | MIT | [npm source archive](https://registry.npmjs.org/@csstools/css-parser-algorithms/-/css-parser-algorithms-4.0.0.tgz) |
| @csstools/css-syntax-patches-for-csstree | 1.1.3 | MIT-0 | [npm source archive](https://registry.npmjs.org/@csstools/css-syntax-patches-for-csstree/-/css-syntax-patches-for-csstree-1.1.3.tgz) |
| @csstools/css-tokenizer | 4.0.0 | MIT | [npm source archive](https://registry.npmjs.org/@csstools/css-tokenizer/-/css-tokenizer-4.0.0.tgz) |
| @esbuild/win32-x64 | 0.25.12 | MIT | [npm source archive](https://registry.npmjs.org/@esbuild/win32-x64/-/win32-x64-0.25.12.tgz) |
| @eslint-community/eslint-utils | 4.9.1 | MIT | [npm source archive](https://registry.npmjs.org/@eslint-community/eslint-utils/-/eslint-utils-4.9.1.tgz) |
| @eslint-community/regexpp | 4.12.2 | MIT | [npm source archive](https://registry.npmjs.org/@eslint-community/regexpp/-/regexpp-4.12.2.tgz) |
| @eslint/config-array | 0.23.5 | Apache-2.0 | [npm source archive](https://registry.npmjs.org/@eslint/config-array/-/config-array-0.23.5.tgz) |
| @eslint/config-helpers | 0.5.5 | Apache-2.0 | [npm source archive](https://registry.npmjs.org/@eslint/config-helpers/-/config-helpers-0.5.5.tgz) |
| @eslint/core | 1.2.1 | Apache-2.0 | [npm source archive](https://registry.npmjs.org/@eslint/core/-/core-1.2.1.tgz) |
| @eslint/js | 10.0.1 | MIT | [npm source archive](https://registry.npmjs.org/@eslint/js/-/js-10.0.1.tgz) |
| @eslint/object-schema | 3.0.5 | Apache-2.0 | [npm source archive](https://registry.npmjs.org/@eslint/object-schema/-/object-schema-3.0.5.tgz) |
| @eslint/plugin-kit | 0.7.1 | Apache-2.0 | [npm source archive](https://registry.npmjs.org/@eslint/plugin-kit/-/plugin-kit-0.7.1.tgz) |
| @exodus/bytes | 1.15.0 | MIT | [npm source archive](https://registry.npmjs.org/@exodus/bytes/-/bytes-1.15.0.tgz) |
| @floating-ui/core | 1.7.5 | MIT | [npm source archive](https://registry.npmjs.org/@floating-ui/core/-/core-1.7.5.tgz) |
| @floating-ui/dom | 1.7.6 | MIT | [npm source archive](https://registry.npmjs.org/@floating-ui/dom/-/dom-1.7.6.tgz) |
| @floating-ui/react-dom | 2.1.8 | MIT | [npm source archive](https://registry.npmjs.org/@floating-ui/react-dom/-/react-dom-2.1.8.tgz) |
| @floating-ui/utils | 0.2.11 | MIT | [npm source archive](https://registry.npmjs.org/@floating-ui/utils/-/utils-0.2.11.tgz) |
| @humanfs/core | 0.19.2 | Apache-2.0 | [npm source archive](https://registry.npmjs.org/@humanfs/core/-/core-0.19.2.tgz) |
| @humanfs/node | 0.16.8 | Apache-2.0 | [npm source archive](https://registry.npmjs.org/@humanfs/node/-/node-0.16.8.tgz) |
| @humanfs/types | 0.15.0 | Apache-2.0 | [npm source archive](https://registry.npmjs.org/@humanfs/types/-/types-0.15.0.tgz) |
| @humanwhocodes/module-importer | 1.0.1 | Apache-2.0 | [npm source archive](https://registry.npmjs.org/@humanwhocodes/module-importer/-/module-importer-1.0.1.tgz) |
| @humanwhocodes/retry | 0.4.3 | Apache-2.0 | [npm source archive](https://registry.npmjs.org/@humanwhocodes/retry/-/retry-0.4.3.tgz) |
| @jridgewell/gen-mapping | 0.3.13 | MIT | [npm source archive](https://registry.npmjs.org/@jridgewell/gen-mapping/-/gen-mapping-0.3.13.tgz) |
| @jridgewell/remapping | 2.3.5 | MIT | [npm source archive](https://registry.npmjs.org/@jridgewell/remapping/-/remapping-2.3.5.tgz) |
| @jridgewell/resolve-uri | 3.1.2 | MIT | [npm source archive](https://registry.npmjs.org/@jridgewell/resolve-uri/-/resolve-uri-3.1.2.tgz) |
| @jridgewell/sourcemap-codec | 1.5.5 | MIT | [npm source archive](https://registry.npmjs.org/@jridgewell/sourcemap-codec/-/sourcemap-codec-1.5.5.tgz) |
| @jridgewell/trace-mapping | 0.3.31 | MIT | [npm source archive](https://registry.npmjs.org/@jridgewell/trace-mapping/-/trace-mapping-0.3.31.tgz) |
| @napi-rs/canvas | 0.1.100 | MIT | [npm source archive](https://registry.npmjs.org/@napi-rs/canvas/-/canvas-0.1.100.tgz) |
| @napi-rs/canvas-win32-x64-msvc | 0.1.100 | MIT | [npm source archive](https://registry.npmjs.org/@napi-rs/canvas-win32-x64-msvc/-/canvas-win32-x64-msvc-0.1.100.tgz) |
| @playwright/test | 1.60.0 | Apache-2.0 | [npm source archive](https://registry.npmjs.org/@playwright/test/-/test-1.60.0.tgz) |
| @radix-ui/number | 1.1.1 | MIT | [npm source archive](https://registry.npmjs.org/@radix-ui/number/-/number-1.1.1.tgz) |
| @radix-ui/primitive | 1.1.3 | MIT | [npm source archive](https://registry.npmjs.org/@radix-ui/primitive/-/primitive-1.1.3.tgz) |
| @radix-ui/react-arrow | 1.1.7 | MIT | [npm source archive](https://registry.npmjs.org/@radix-ui/react-arrow/-/react-arrow-1.1.7.tgz) |
| @radix-ui/react-collection | 1.1.7 | MIT | [npm source archive](https://registry.npmjs.org/@radix-ui/react-collection/-/react-collection-1.1.7.tgz) |
| @radix-ui/react-compose-refs | 1.1.2 | MIT | [npm source archive](https://registry.npmjs.org/@radix-ui/react-compose-refs/-/react-compose-refs-1.1.2.tgz) |
| @radix-ui/react-context | 1.1.2 | MIT | [npm source archive](https://registry.npmjs.org/@radix-ui/react-context/-/react-context-1.1.2.tgz) |
| @radix-ui/react-context | 1.1.3 | MIT | [npm source archive](https://registry.npmjs.org/@radix-ui/react-context/-/react-context-1.1.3.tgz) |
| @radix-ui/react-dialog | 1.1.15 | MIT | [npm source archive](https://registry.npmjs.org/@radix-ui/react-dialog/-/react-dialog-1.1.15.tgz) |
| @radix-ui/react-direction | 1.1.1 | MIT | [npm source archive](https://registry.npmjs.org/@radix-ui/react-direction/-/react-direction-1.1.1.tgz) |
| @radix-ui/react-dismissable-layer | 1.1.11 | MIT | [npm source archive](https://registry.npmjs.org/@radix-ui/react-dismissable-layer/-/react-dismissable-layer-1.1.11.tgz) |
| @radix-ui/react-dropdown-menu | 2.1.16 | MIT | [npm source archive](https://registry.npmjs.org/@radix-ui/react-dropdown-menu/-/react-dropdown-menu-2.1.16.tgz) |
| @radix-ui/react-focus-guards | 1.1.3 | MIT | [npm source archive](https://registry.npmjs.org/@radix-ui/react-focus-guards/-/react-focus-guards-1.1.3.tgz) |
| @radix-ui/react-focus-scope | 1.1.7 | MIT | [npm source archive](https://registry.npmjs.org/@radix-ui/react-focus-scope/-/react-focus-scope-1.1.7.tgz) |
| @radix-ui/react-checkbox | 1.3.3 | MIT | [npm source archive](https://registry.npmjs.org/@radix-ui/react-checkbox/-/react-checkbox-1.3.3.tgz) |
| @radix-ui/react-id | 1.1.1 | MIT | [npm source archive](https://registry.npmjs.org/@radix-ui/react-id/-/react-id-1.1.1.tgz) |
| @radix-ui/react-label | 2.1.8 | MIT | [npm source archive](https://registry.npmjs.org/@radix-ui/react-label/-/react-label-2.1.8.tgz) |
| @radix-ui/react-menu | 2.1.16 | MIT | [npm source archive](https://registry.npmjs.org/@radix-ui/react-menu/-/react-menu-2.1.16.tgz) |
| @radix-ui/react-popover | 1.1.15 | MIT | [npm source archive](https://registry.npmjs.org/@radix-ui/react-popover/-/react-popover-1.1.15.tgz) |
| @radix-ui/react-popper | 1.2.8 | MIT | [npm source archive](https://registry.npmjs.org/@radix-ui/react-popper/-/react-popper-1.2.8.tgz) |
| @radix-ui/react-portal | 1.1.9 | MIT | [npm source archive](https://registry.npmjs.org/@radix-ui/react-portal/-/react-portal-1.1.9.tgz) |
| @radix-ui/react-presence | 1.1.5 | MIT | [npm source archive](https://registry.npmjs.org/@radix-ui/react-presence/-/react-presence-1.1.5.tgz) |
| @radix-ui/react-primitive | 2.1.3 | MIT | [npm source archive](https://registry.npmjs.org/@radix-ui/react-primitive/-/react-primitive-2.1.3.tgz) |
| @radix-ui/react-primitive | 2.1.4 | MIT | [npm source archive](https://registry.npmjs.org/@radix-ui/react-primitive/-/react-primitive-2.1.4.tgz) |
| @radix-ui/react-progress | 1.1.8 | MIT | [npm source archive](https://registry.npmjs.org/@radix-ui/react-progress/-/react-progress-1.1.8.tgz) |
| @radix-ui/react-roving-focus | 1.1.11 | MIT | [npm source archive](https://registry.npmjs.org/@radix-ui/react-roving-focus/-/react-roving-focus-1.1.11.tgz) |
| @radix-ui/react-select | 2.2.6 | MIT | [npm source archive](https://registry.npmjs.org/@radix-ui/react-select/-/react-select-2.2.6.tgz) |
| @radix-ui/react-slider | 1.3.6 | MIT | [npm source archive](https://registry.npmjs.org/@radix-ui/react-slider/-/react-slider-1.3.6.tgz) |
| @radix-ui/react-slot | 1.2.3 | MIT | [npm source archive](https://registry.npmjs.org/@radix-ui/react-slot/-/react-slot-1.2.3.tgz) |
| @radix-ui/react-slot | 1.2.4 | MIT | [npm source archive](https://registry.npmjs.org/@radix-ui/react-slot/-/react-slot-1.2.4.tgz) |
| @radix-ui/react-tabs | 1.1.13 | MIT | [npm source archive](https://registry.npmjs.org/@radix-ui/react-tabs/-/react-tabs-1.1.13.tgz) |
| @radix-ui/react-toast | 1.2.15 | MIT | [npm source archive](https://registry.npmjs.org/@radix-ui/react-toast/-/react-toast-1.2.15.tgz) |
| @radix-ui/react-toggle | 1.1.10 | MIT | [npm source archive](https://registry.npmjs.org/@radix-ui/react-toggle/-/react-toggle-1.1.10.tgz) |
| @radix-ui/react-toggle-group | 1.1.11 | MIT | [npm source archive](https://registry.npmjs.org/@radix-ui/react-toggle-group/-/react-toggle-group-1.1.11.tgz) |
| @radix-ui/react-tooltip | 1.2.8 | MIT | [npm source archive](https://registry.npmjs.org/@radix-ui/react-tooltip/-/react-tooltip-1.2.8.tgz) |
| @radix-ui/react-use-callback-ref | 1.1.1 | MIT | [npm source archive](https://registry.npmjs.org/@radix-ui/react-use-callback-ref/-/react-use-callback-ref-1.1.1.tgz) |
| @radix-ui/react-use-controllable-state | 1.2.2 | MIT | [npm source archive](https://registry.npmjs.org/@radix-ui/react-use-controllable-state/-/react-use-controllable-state-1.2.2.tgz) |
| @radix-ui/react-use-effect-event | 0.0.2 | MIT | [npm source archive](https://registry.npmjs.org/@radix-ui/react-use-effect-event/-/react-use-effect-event-0.0.2.tgz) |
| @radix-ui/react-use-escape-keydown | 1.1.1 | MIT | [npm source archive](https://registry.npmjs.org/@radix-ui/react-use-escape-keydown/-/react-use-escape-keydown-1.1.1.tgz) |
| @radix-ui/react-use-layout-effect | 1.1.1 | MIT | [npm source archive](https://registry.npmjs.org/@radix-ui/react-use-layout-effect/-/react-use-layout-effect-1.1.1.tgz) |
| @radix-ui/react-use-previous | 1.1.1 | MIT | [npm source archive](https://registry.npmjs.org/@radix-ui/react-use-previous/-/react-use-previous-1.1.1.tgz) |
| @radix-ui/react-use-rect | 1.1.1 | MIT | [npm source archive](https://registry.npmjs.org/@radix-ui/react-use-rect/-/react-use-rect-1.1.1.tgz) |
| @radix-ui/react-use-size | 1.1.1 | MIT | [npm source archive](https://registry.npmjs.org/@radix-ui/react-use-size/-/react-use-size-1.1.1.tgz) |
| @radix-ui/react-visually-hidden | 1.2.3 | MIT | [npm source archive](https://registry.npmjs.org/@radix-ui/react-visually-hidden/-/react-visually-hidden-1.2.3.tgz) |
| @radix-ui/rect | 1.1.1 | MIT | [npm source archive](https://registry.npmjs.org/@radix-ui/rect/-/rect-1.1.1.tgz) |
| @rolldown/pluginutils | 1.0.0-beta.27 | MIT | [npm source archive](https://registry.npmjs.org/@rolldown/pluginutils/-/pluginutils-1.0.0-beta.27.tgz) |
| @rollup/rollup-win32-x64-gnu | 4.60.3 | MIT | [npm source archive](https://registry.npmjs.org/@rollup/rollup-win32-x64-gnu/-/rollup-win32-x64-gnu-4.60.3.tgz) |
| @rollup/rollup-win32-x64-msvc | 4.60.3 | MIT | [npm source archive](https://registry.npmjs.org/@rollup/rollup-win32-x64-msvc/-/rollup-win32-x64-msvc-4.60.3.tgz) |
| @standard-schema/spec | 1.1.0 | MIT | [npm source archive](https://registry.npmjs.org/@standard-schema/spec/-/spec-1.1.0.tgz) |
| @tailwindcss/node | 4.3.0 | MIT | [npm source archive](https://registry.npmjs.org/@tailwindcss/node/-/node-4.3.0.tgz) |
| @tailwindcss/oxide | 4.3.0 | MIT | [npm source archive](https://registry.npmjs.org/@tailwindcss/oxide/-/oxide-4.3.0.tgz) |
| @tailwindcss/oxide-win32-x64-msvc | 4.3.0 | MIT | [npm source archive](https://registry.npmjs.org/@tailwindcss/oxide-win32-x64-msvc/-/oxide-win32-x64-msvc-4.3.0.tgz) |
| @tailwindcss/vite | 4.3.0 | MIT | [npm source archive](https://registry.npmjs.org/@tailwindcss/vite/-/vite-4.3.0.tgz) |
| @tanstack/history | 1.161.6 | MIT | [npm source archive](https://registry.npmjs.org/@tanstack/history/-/history-1.161.6.tgz) |
| @tanstack/query-core | 5.100.9 | MIT | [npm source archive](https://registry.npmjs.org/@tanstack/query-core/-/query-core-5.100.9.tgz) |
| @tanstack/query-devtools | 5.100.9 | MIT | [npm source archive](https://registry.npmjs.org/@tanstack/query-devtools/-/query-devtools-5.100.9.tgz) |
| @tanstack/react-query | 5.100.9 | MIT | [npm source archive](https://registry.npmjs.org/@tanstack/react-query/-/react-query-5.100.9.tgz) |
| @tanstack/react-query-devtools | 5.100.9 | MIT | [npm source archive](https://registry.npmjs.org/@tanstack/react-query-devtools/-/react-query-devtools-5.100.9.tgz) |
| @tanstack/react-router | 1.169.2 | MIT | [npm source archive](https://registry.npmjs.org/@tanstack/react-router/-/react-router-1.169.2.tgz) |
| @tanstack/react-router-devtools | 1.166.13 | MIT | [npm source archive](https://registry.npmjs.org/@tanstack/react-router-devtools/-/react-router-devtools-1.166.13.tgz) |
| @tanstack/react-store | 0.9.3 | MIT | [npm source archive](https://registry.npmjs.org/@tanstack/react-store/-/react-store-0.9.3.tgz) |
| @tanstack/router-core | 1.169.2 | MIT | [npm source archive](https://registry.npmjs.org/@tanstack/router-core/-/router-core-1.169.2.tgz) |
| @tanstack/router-devtools | 1.166.13 | MIT | [npm source archive](https://registry.npmjs.org/@tanstack/router-devtools/-/router-devtools-1.166.13.tgz) |
| @tanstack/router-devtools-core | 1.167.3 | MIT | [npm source archive](https://registry.npmjs.org/@tanstack/router-devtools-core/-/router-devtools-core-1.167.3.tgz) |
| @tanstack/router-generator | 1.166.42 | MIT | [npm source archive](https://registry.npmjs.org/@tanstack/router-generator/-/router-generator-1.166.42.tgz) |
| @tanstack/router-plugin | 1.167.35 | MIT | [npm source archive](https://registry.npmjs.org/@tanstack/router-plugin/-/router-plugin-1.167.35.tgz) |
| @tanstack/router-utils | 1.161.8 | MIT | [npm source archive](https://registry.npmjs.org/@tanstack/router-utils/-/router-utils-1.161.8.tgz) |
| @tanstack/store | 0.9.3 | MIT | [npm source archive](https://registry.npmjs.org/@tanstack/store/-/store-0.9.3.tgz) |
| @tanstack/virtual-file-routes | 1.161.7 | MIT | [npm source archive](https://registry.npmjs.org/@tanstack/virtual-file-routes/-/virtual-file-routes-1.161.7.tgz) |
| @tauri-apps/api | 2.11.0 | Apache-2.0 OR MIT | [npm source archive](https://registry.npmjs.org/@tauri-apps/api/-/api-2.11.0.tgz) |
| @tauri-apps/cli | 2.11.1 | Apache-2.0 OR MIT | [npm source archive](https://registry.npmjs.org/@tauri-apps/cli/-/cli-2.11.1.tgz) |
| @tauri-apps/cli-win32-x64-msvc | 2.11.1 | Apache-2.0 OR MIT | [npm source archive](https://registry.npmjs.org/@tauri-apps/cli-win32-x64-msvc/-/cli-win32-x64-msvc-2.11.1.tgz) |
| @tauri-apps/plugin-dialog | 2.7.1 | MIT OR Apache-2.0 | [npm source archive](https://registry.npmjs.org/@tauri-apps/plugin-dialog/-/plugin-dialog-2.7.1.tgz) |
| @tauri-apps/plugin-fs | 2.5.1 | MIT OR Apache-2.0 | [npm source archive](https://registry.npmjs.org/@tauri-apps/plugin-fs/-/plugin-fs-2.5.1.tgz) |
| @tauri-apps/plugin-opener | 2.5.4 | MIT OR Apache-2.0 | [npm source archive](https://registry.npmjs.org/@tauri-apps/plugin-opener/-/plugin-opener-2.5.4.tgz) |
| @tauri-apps/plugin-process | 2.3.1 | MIT OR Apache-2.0 | [npm source archive](https://registry.npmjs.org/@tauri-apps/plugin-process/-/plugin-process-2.3.1.tgz) |
| @testing-library/dom | 10.4.1 | MIT | [npm source archive](https://registry.npmjs.org/@testing-library/dom/-/dom-10.4.1.tgz) |
| @testing-library/jest-dom | 6.9.1 | MIT | [npm source archive](https://registry.npmjs.org/@testing-library/jest-dom/-/jest-dom-6.9.1.tgz) |
| @testing-library/react | 16.3.2 | MIT | [npm source archive](https://registry.npmjs.org/@testing-library/react/-/react-16.3.2.tgz) |
| @testing-library/user-event | 14.6.1 | MIT | [npm source archive](https://registry.npmjs.org/@testing-library/user-event/-/user-event-14.6.1.tgz) |
| @types/aria-query | 5.0.4 | MIT | [npm source archive](https://registry.npmjs.org/@types/aria-query/-/aria-query-5.0.4.tgz) |
| @types/babel__core | 7.20.5 | MIT | [npm source archive](https://registry.npmjs.org/@types/babel__core/-/babel__core-7.20.5.tgz) |
| @types/babel__generator | 7.27.0 | MIT | [npm source archive](https://registry.npmjs.org/@types/babel__generator/-/babel__generator-7.27.0.tgz) |
| @types/babel__template | 7.4.4 | MIT | [npm source archive](https://registry.npmjs.org/@types/babel__template/-/babel__template-7.4.4.tgz) |
| @types/babel__traverse | 7.28.0 | MIT | [npm source archive](https://registry.npmjs.org/@types/babel__traverse/-/babel__traverse-7.28.0.tgz) |
| @types/d3-color | 3.1.3 | MIT | [npm source archive](https://registry.npmjs.org/@types/d3-color/-/d3-color-3.1.3.tgz) |
| @types/d3-drag | 3.0.7 | MIT | [npm source archive](https://registry.npmjs.org/@types/d3-drag/-/d3-drag-3.0.7.tgz) |
| @types/d3-interpolate | 3.0.4 | MIT | [npm source archive](https://registry.npmjs.org/@types/d3-interpolate/-/d3-interpolate-3.0.4.tgz) |
| @types/d3-selection | 3.0.11 | MIT | [npm source archive](https://registry.npmjs.org/@types/d3-selection/-/d3-selection-3.0.11.tgz) |
| @types/d3-transition | 3.0.9 | MIT | [npm source archive](https://registry.npmjs.org/@types/d3-transition/-/d3-transition-3.0.9.tgz) |
| @types/d3-zoom | 3.0.8 | MIT | [npm source archive](https://registry.npmjs.org/@types/d3-zoom/-/d3-zoom-3.0.8.tgz) |
| @types/deep-eql | 4.0.2 | MIT | [npm source archive](https://registry.npmjs.org/@types/deep-eql/-/deep-eql-4.0.2.tgz) |
| @types/esrecurse | 4.3.1 | MIT | [npm source archive](https://registry.npmjs.org/@types/esrecurse/-/esrecurse-4.3.1.tgz) |
| @types/estree | 1.0.8 | MIT | [npm source archive](https://registry.npmjs.org/@types/estree/-/estree-1.0.8.tgz) |
| @types/chai | 5.2.3 | MIT | [npm source archive](https://registry.npmjs.org/@types/chai/-/chai-5.2.3.tgz) |
| @types/json-schema | 7.0.15 | MIT | [npm source archive](https://registry.npmjs.org/@types/json-schema/-/json-schema-7.0.15.tgz) |
| @types/node | 25.7.0 | MIT | [npm source archive](https://registry.npmjs.org/@types/node/-/node-25.7.0.tgz) |
| @types/react | 19.2.14 | MIT | [npm source archive](https://registry.npmjs.org/@types/react/-/react-19.2.14.tgz) |
| @types/react-dom | 19.2.3 | MIT | [npm source archive](https://registry.npmjs.org/@types/react-dom/-/react-dom-19.2.3.tgz) |
| @types/react-reconciler | 0.28.9 | MIT | [npm source archive](https://registry.npmjs.org/@types/react-reconciler/-/react-reconciler-0.28.9.tgz) |
| @types/react-reconciler | 0.33.0 | MIT | [npm source archive](https://registry.npmjs.org/@types/react-reconciler/-/react-reconciler-0.33.0.tgz) |
| @types/react-window | 2.0.0 | MIT | [npm source archive](https://registry.npmjs.org/@types/react-window/-/react-window-2.0.0.tgz) |
| @typescript-eslint/eslint-plugin | 8.59.2 | MIT | [npm source archive](https://registry.npmjs.org/@typescript-eslint/eslint-plugin/-/eslint-plugin-8.59.2.tgz) |
| @typescript-eslint/parser | 8.59.2 | MIT | [npm source archive](https://registry.npmjs.org/@typescript-eslint/parser/-/parser-8.59.2.tgz) |
| @typescript-eslint/project-service | 8.59.2 | MIT | [npm source archive](https://registry.npmjs.org/@typescript-eslint/project-service/-/project-service-8.59.2.tgz) |
| @typescript-eslint/scope-manager | 8.59.2 | MIT | [npm source archive](https://registry.npmjs.org/@typescript-eslint/scope-manager/-/scope-manager-8.59.2.tgz) |
| @typescript-eslint/tsconfig-utils | 8.59.2 | MIT | [npm source archive](https://registry.npmjs.org/@typescript-eslint/tsconfig-utils/-/tsconfig-utils-8.59.2.tgz) |
| @typescript-eslint/type-utils | 8.59.2 | MIT | [npm source archive](https://registry.npmjs.org/@typescript-eslint/type-utils/-/type-utils-8.59.2.tgz) |
| @typescript-eslint/types | 8.59.2 | MIT | [npm source archive](https://registry.npmjs.org/@typescript-eslint/types/-/types-8.59.2.tgz) |
| @typescript-eslint/typescript-estree | 8.59.2 | MIT | [npm source archive](https://registry.npmjs.org/@typescript-eslint/typescript-estree/-/typescript-estree-8.59.2.tgz) |
| @typescript-eslint/utils | 8.59.2 | MIT | [npm source archive](https://registry.npmjs.org/@typescript-eslint/utils/-/utils-8.59.2.tgz) |
| @typescript-eslint/visitor-keys | 8.59.2 | MIT | [npm source archive](https://registry.npmjs.org/@typescript-eslint/visitor-keys/-/visitor-keys-8.59.2.tgz) |
| @vitejs/plugin-react | 4.7.0 | MIT | [npm source archive](https://registry.npmjs.org/@vitejs/plugin-react/-/plugin-react-4.7.0.tgz) |
| @vitest/expect | 4.1.5 | MIT | [npm source archive](https://registry.npmjs.org/@vitest/expect/-/expect-4.1.5.tgz) |
| @vitest/mocker | 4.1.5 | MIT | [npm source archive](https://registry.npmjs.org/@vitest/mocker/-/mocker-4.1.5.tgz) |
| @vitest/pretty-format | 4.1.5 | MIT | [npm source archive](https://registry.npmjs.org/@vitest/pretty-format/-/pretty-format-4.1.5.tgz) |
| @vitest/runner | 4.1.5 | MIT | [npm source archive](https://registry.npmjs.org/@vitest/runner/-/runner-4.1.5.tgz) |
| @vitest/snapshot | 4.1.5 | MIT | [npm source archive](https://registry.npmjs.org/@vitest/snapshot/-/snapshot-4.1.5.tgz) |
| @vitest/spy | 4.1.5 | MIT | [npm source archive](https://registry.npmjs.org/@vitest/spy/-/spy-4.1.5.tgz) |
| @vitest/utils | 4.1.5 | MIT | [npm source archive](https://registry.npmjs.org/@vitest/utils/-/utils-4.1.5.tgz) |
| @xyflow/react | 12.10.2 | MIT | [npm source archive](https://registry.npmjs.org/@xyflow/react/-/react-12.10.2.tgz) |
| @xyflow/system | 0.0.76 | MIT | [npm source archive](https://registry.npmjs.org/@xyflow/system/-/system-0.0.76.tgz) |
| acorn | 8.16.0 | MIT | [npm source archive](https://registry.npmjs.org/acorn/-/acorn-8.16.0.tgz) |
| acorn-jsx | 5.3.2 | MIT | [npm source archive](https://registry.npmjs.org/acorn-jsx/-/acorn-jsx-5.3.2.tgz) |
| ajv | 6.15.0 | MIT | [npm source archive](https://registry.npmjs.org/ajv/-/ajv-6.15.0.tgz) |
| ansi-regex | 5.0.1 | MIT | [npm source archive](https://registry.npmjs.org/ansi-regex/-/ansi-regex-5.0.1.tgz) |
| ansi-styles | 5.2.0 | MIT | [npm source archive](https://registry.npmjs.org/ansi-styles/-/ansi-styles-5.2.0.tgz) |
| ansis | 4.2.0 | ISC | [npm source archive](https://registry.npmjs.org/ansis/-/ansis-4.2.0.tgz) |
| anymatch | 3.1.3 | ISC | [npm source archive](https://registry.npmjs.org/anymatch/-/anymatch-3.1.3.tgz) |
| aria-hidden | 1.2.6 | MIT | [npm source archive](https://registry.npmjs.org/aria-hidden/-/aria-hidden-1.2.6.tgz) |
| aria-query | 5.3.0 | Apache-2.0 | [npm source archive](https://registry.npmjs.org/aria-query/-/aria-query-5.3.0.tgz) |
| aria-query | 5.3.2 | Apache-2.0 | [npm source archive](https://registry.npmjs.org/aria-query/-/aria-query-5.3.2.tgz) |
| assertion-error | 2.0.1 | MIT | [npm source archive](https://registry.npmjs.org/assertion-error/-/assertion-error-2.0.1.tgz) |
| axe-core | 4.11.4 | MPL-2.0 | [npm source archive](https://registry.npmjs.org/axe-core/-/axe-core-4.11.4.tgz) |
| babel-dead-code-elimination | 1.0.12 | MIT | [npm source archive](https://registry.npmjs.org/babel-dead-code-elimination/-/babel-dead-code-elimination-1.0.12.tgz) |
| balanced-match | 4.0.4 | MIT | [npm source archive](https://registry.npmjs.org/balanced-match/-/balanced-match-4.0.4.tgz) |
| baseline-browser-mapping | 2.10.28 | Apache-2.0 | [npm source archive](https://registry.npmjs.org/baseline-browser-mapping/-/baseline-browser-mapping-2.10.28.tgz) |
| bidi-js | 1.0.3 | MIT | [npm source archive](https://registry.npmjs.org/bidi-js/-/bidi-js-1.0.3.tgz) |
| binary-extensions | 2.3.0 | MIT | [npm source archive](https://registry.npmjs.org/binary-extensions/-/binary-extensions-2.3.0.tgz) |
| brace-expansion | 5.0.6 | MIT | [npm source archive](https://registry.npmjs.org/brace-expansion/-/brace-expansion-5.0.6.tgz) |
| braces | 3.0.3 | MIT | [npm source archive](https://registry.npmjs.org/braces/-/braces-3.0.3.tgz) |
| browserslist | 4.28.2 | MIT | [npm source archive](https://registry.npmjs.org/browserslist/-/browserslist-4.28.2.tgz) |
| caniuse-lite | 1.0.30001792 | CC-BY-4.0 | [npm source archive](https://registry.npmjs.org/caniuse-lite/-/caniuse-lite-1.0.30001792.tgz) |
| class-variance-authority | 0.7.1 | Apache-2.0 | [npm source archive](https://registry.npmjs.org/class-variance-authority/-/class-variance-authority-0.7.1.tgz) |
| classcat | 5.0.5 | MIT | [npm source archive](https://registry.npmjs.org/classcat/-/classcat-5.0.5.tgz) |
| clsx | 2.1.1 | MIT | [npm source archive](https://registry.npmjs.org/clsx/-/clsx-2.1.1.tgz) |
| convert-source-map | 2.0.0 | MIT | [npm source archive](https://registry.npmjs.org/convert-source-map/-/convert-source-map-2.0.0.tgz) |
| cookie-es | 3.1.1 | MIT | [npm source archive](https://registry.npmjs.org/cookie-es/-/cookie-es-3.1.1.tgz) |
| cross-spawn | 7.0.6 | MIT | [npm source archive](https://registry.npmjs.org/cross-spawn/-/cross-spawn-7.0.6.tgz) |
| css-tree | 3.2.1 | MIT | [npm source archive](https://registry.npmjs.org/css-tree/-/css-tree-3.2.1.tgz) |
| css.escape | 1.5.1 | MIT | [npm source archive](https://registry.npmjs.org/css.escape/-/css.escape-1.5.1.tgz) |
| csstype | 3.2.3 | MIT | [npm source archive](https://registry.npmjs.org/csstype/-/csstype-3.2.3.tgz) |
| d3-color | 3.1.0 | ISC | [npm source archive](https://registry.npmjs.org/d3-color/-/d3-color-3.1.0.tgz) |
| d3-dispatch | 3.0.1 | ISC | [npm source archive](https://registry.npmjs.org/d3-dispatch/-/d3-dispatch-3.0.1.tgz) |
| d3-drag | 3.0.0 | ISC | [npm source archive](https://registry.npmjs.org/d3-drag/-/d3-drag-3.0.0.tgz) |
| d3-ease | 3.0.1 | BSD-3-Clause | [npm source archive](https://registry.npmjs.org/d3-ease/-/d3-ease-3.0.1.tgz) |
| d3-interpolate | 3.0.1 | ISC | [npm source archive](https://registry.npmjs.org/d3-interpolate/-/d3-interpolate-3.0.1.tgz) |
| d3-selection | 3.0.0 | ISC | [npm source archive](https://registry.npmjs.org/d3-selection/-/d3-selection-3.0.0.tgz) |
| d3-timer | 3.0.1 | ISC | [npm source archive](https://registry.npmjs.org/d3-timer/-/d3-timer-3.0.1.tgz) |
| d3-transition | 3.0.1 | ISC | [npm source archive](https://registry.npmjs.org/d3-transition/-/d3-transition-3.0.1.tgz) |
| d3-zoom | 3.0.0 | ISC | [npm source archive](https://registry.npmjs.org/d3-zoom/-/d3-zoom-3.0.0.tgz) |
| data-urls | 7.0.0 | MIT | [npm source archive](https://registry.npmjs.org/data-urls/-/data-urls-7.0.0.tgz) |
| debug | 4.4.3 | MIT | [npm source archive](https://registry.npmjs.org/debug/-/debug-4.4.3.tgz) |
| decimal.js | 10.6.0 | MIT | [npm source archive](https://registry.npmjs.org/decimal.js/-/decimal.js-10.6.0.tgz) |
| deep-is | 0.1.4 | MIT | [npm source archive](https://registry.npmjs.org/deep-is/-/deep-is-0.1.4.tgz) |
| dequal | 2.0.3 | MIT | [npm source archive](https://registry.npmjs.org/dequal/-/dequal-2.0.3.tgz) |
| detect-libc | 2.1.2 | Apache-2.0 | [npm source archive](https://registry.npmjs.org/detect-libc/-/detect-libc-2.1.2.tgz) |
| detect-node-es | 1.1.0 | MIT | [npm source archive](https://registry.npmjs.org/detect-node-es/-/detect-node-es-1.1.0.tgz) |
| diff | 8.0.4 | BSD-3-Clause | [npm source archive](https://registry.npmjs.org/diff/-/diff-8.0.4.tgz) |
| dom-accessibility-api | 0.5.16 | MIT | [npm source archive](https://registry.npmjs.org/dom-accessibility-api/-/dom-accessibility-api-0.5.16.tgz) |
| dom-accessibility-api | 0.6.3 | MIT | [npm source archive](https://registry.npmjs.org/dom-accessibility-api/-/dom-accessibility-api-0.6.3.tgz) |
| electron-to-chromium | 1.5.353 | ISC | [npm source archive](https://registry.npmjs.org/electron-to-chromium/-/electron-to-chromium-1.5.353.tgz) |
| enhanced-resolve | 5.21.2 | MIT | [npm source archive](https://registry.npmjs.org/enhanced-resolve/-/enhanced-resolve-5.21.2.tgz) |
| entities | 8.0.0 | BSD-2-Clause | [npm source archive](https://registry.npmjs.org/entities/-/entities-8.0.0.tgz) |
| es-module-lexer | 2.1.0 | MIT | [npm source archive](https://registry.npmjs.org/es-module-lexer/-/es-module-lexer-2.1.0.tgz) |
| esbuild | 0.25.12 | MIT | [npm source archive](https://registry.npmjs.org/esbuild/-/esbuild-0.25.12.tgz) |
| escalade | 3.2.0 | MIT | [npm source archive](https://registry.npmjs.org/escalade/-/escalade-3.2.0.tgz) |
| escape-string-regexp | 4.0.0 | MIT | [npm source archive](https://registry.npmjs.org/escape-string-regexp/-/escape-string-regexp-4.0.0.tgz) |
| eslint | 10.3.0 | MIT | [npm source archive](https://registry.npmjs.org/eslint/-/eslint-10.3.0.tgz) |
| eslint-plugin-react-hooks | 7.1.1 | MIT | [npm source archive](https://registry.npmjs.org/eslint-plugin-react-hooks/-/eslint-plugin-react-hooks-7.1.1.tgz) |
| eslint-plugin-react-refresh | 0.5.2 | MIT | [npm source archive](https://registry.npmjs.org/eslint-plugin-react-refresh/-/eslint-plugin-react-refresh-0.5.2.tgz) |
| eslint-scope | 9.1.2 | BSD-2-Clause | [npm source archive](https://registry.npmjs.org/eslint-scope/-/eslint-scope-9.1.2.tgz) |
| eslint-visitor-keys | 3.4.3 | Apache-2.0 | [npm source archive](https://registry.npmjs.org/eslint-visitor-keys/-/eslint-visitor-keys-3.4.3.tgz) |
| eslint-visitor-keys | 5.0.1 | Apache-2.0 | [npm source archive](https://registry.npmjs.org/eslint-visitor-keys/-/eslint-visitor-keys-5.0.1.tgz) |
| espree | 11.2.0 | BSD-2-Clause | [npm source archive](https://registry.npmjs.org/espree/-/espree-11.2.0.tgz) |
| esquery | 1.7.0 | BSD-3-Clause | [npm source archive](https://registry.npmjs.org/esquery/-/esquery-1.7.0.tgz) |
| esrecurse | 4.3.0 | BSD-2-Clause | [npm source archive](https://registry.npmjs.org/esrecurse/-/esrecurse-4.3.0.tgz) |
| estraverse | 5.3.0 | BSD-2-Clause | [npm source archive](https://registry.npmjs.org/estraverse/-/estraverse-5.3.0.tgz) |
| estree-walker | 3.0.3 | MIT | [npm source archive](https://registry.npmjs.org/estree-walker/-/estree-walker-3.0.3.tgz) |
| esutils | 2.0.3 | BSD-2-Clause | [npm source archive](https://registry.npmjs.org/esutils/-/esutils-2.0.3.tgz) |
| expect-type | 1.3.0 | Apache-2.0 | [npm source archive](https://registry.npmjs.org/expect-type/-/expect-type-1.3.0.tgz) |
| fast-deep-equal | 3.1.3 | MIT | [npm source archive](https://registry.npmjs.org/fast-deep-equal/-/fast-deep-equal-3.1.3.tgz) |
| fast-json-stable-stringify | 2.1.0 | MIT | [npm source archive](https://registry.npmjs.org/fast-json-stable-stringify/-/fast-json-stable-stringify-2.1.0.tgz) |
| fast-levenshtein | 2.0.6 | MIT | [npm source archive](https://registry.npmjs.org/fast-levenshtein/-/fast-levenshtein-2.0.6.tgz) |
| fdir | 6.5.0 | MIT | [npm source archive](https://registry.npmjs.org/fdir/-/fdir-6.5.0.tgz) |
| file-entry-cache | 8.0.0 | MIT | [npm source archive](https://registry.npmjs.org/file-entry-cache/-/file-entry-cache-8.0.0.tgz) |
| fill-range | 7.1.1 | MIT | [npm source archive](https://registry.npmjs.org/fill-range/-/fill-range-7.1.1.tgz) |
| find-up | 5.0.0 | MIT | [npm source archive](https://registry.npmjs.org/find-up/-/find-up-5.0.0.tgz) |
| flat-cache | 4.0.1 | MIT | [npm source archive](https://registry.npmjs.org/flat-cache/-/flat-cache-4.0.1.tgz) |
| flatted | 3.4.2 | ISC | [npm source archive](https://registry.npmjs.org/flatted/-/flatted-3.4.2.tgz) |
| gensync | 1.0.0-beta.2 | MIT | [npm source archive](https://registry.npmjs.org/gensync/-/gensync-1.0.0-beta.2.tgz) |
| get-nonce | 1.0.1 | MIT | [npm source archive](https://registry.npmjs.org/get-nonce/-/get-nonce-1.0.1.tgz) |
| glob-parent | 5.1.2 | ISC | [npm source archive](https://registry.npmjs.org/glob-parent/-/glob-parent-5.1.2.tgz) |
| glob-parent | 6.0.2 | ISC | [npm source archive](https://registry.npmjs.org/glob-parent/-/glob-parent-6.0.2.tgz) |
| goober | 2.1.18 | MIT | [npm source archive](https://registry.npmjs.org/goober/-/goober-2.1.18.tgz) |
| graceful-fs | 4.2.11 | ISC | [npm source archive](https://registry.npmjs.org/graceful-fs/-/graceful-fs-4.2.11.tgz) |
| hermes-estree | 0.25.1 | MIT | [npm source archive](https://registry.npmjs.org/hermes-estree/-/hermes-estree-0.25.1.tgz) |
| hermes-parser | 0.25.1 | MIT | [npm source archive](https://registry.npmjs.org/hermes-parser/-/hermes-parser-0.25.1.tgz) |
| html-encoding-sniffer | 6.0.0 | MIT | [npm source archive](https://registry.npmjs.org/html-encoding-sniffer/-/html-encoding-sniffer-6.0.0.tgz) |
| html-parse-stringify | 3.0.1 | MIT | [npm source archive](https://registry.npmjs.org/html-parse-stringify/-/html-parse-stringify-3.0.1.tgz) |
| chai | 6.2.2 | MIT | [npm source archive](https://registry.npmjs.org/chai/-/chai-6.2.2.tgz) |
| chalk | 5.6.2 | MIT | [npm source archive](https://registry.npmjs.org/chalk/-/chalk-5.6.2.tgz) |
| chokidar | 3.6.0 | MIT | [npm source archive](https://registry.npmjs.org/chokidar/-/chokidar-3.6.0.tgz) |
| i18next | 26.0.10 | MIT | [npm source archive](https://registry.npmjs.org/i18next/-/i18next-26.0.10.tgz) |
| i18next-browser-languagedetector | 8.2.1 | MIT | [npm source archive](https://registry.npmjs.org/i18next-browser-languagedetector/-/i18next-browser-languagedetector-8.2.1.tgz) |
| ignore | 5.3.2 | MIT | [npm source archive](https://registry.npmjs.org/ignore/-/ignore-5.3.2.tgz) |
| ignore | 7.0.5 | MIT | [npm source archive](https://registry.npmjs.org/ignore/-/ignore-7.0.5.tgz) |
| imurmurhash | 0.1.4 | MIT | [npm source archive](https://registry.npmjs.org/imurmurhash/-/imurmurhash-0.1.4.tgz) |
| indent-string | 4.0.0 | MIT | [npm source archive](https://registry.npmjs.org/indent-string/-/indent-string-4.0.0.tgz) |
| intro.js | 8.3.2 | AGPL-3.0 | [npm source archive](https://registry.npmjs.org/intro.js/-/intro.js-8.3.2.tgz) |
| is-binary-path | 2.1.0 | MIT | [npm source archive](https://registry.npmjs.org/is-binary-path/-/is-binary-path-2.1.0.tgz) |
| is-extglob | 2.1.1 | MIT | [npm source archive](https://registry.npmjs.org/is-extglob/-/is-extglob-2.1.1.tgz) |
| is-glob | 4.0.3 | MIT | [npm source archive](https://registry.npmjs.org/is-glob/-/is-glob-4.0.3.tgz) |
| is-number | 7.0.0 | MIT | [npm source archive](https://registry.npmjs.org/is-number/-/is-number-7.0.0.tgz) |
| is-potential-custom-element-name | 1.0.1 | MIT | [npm source archive](https://registry.npmjs.org/is-potential-custom-element-name/-/is-potential-custom-element-name-1.0.1.tgz) |
| isbot | 5.1.40 | Unlicense | [npm source archive](https://registry.npmjs.org/isbot/-/isbot-5.1.40.tgz) |
| isexe | 2.0.0 | ISC | [npm source archive](https://registry.npmjs.org/isexe/-/isexe-2.0.0.tgz) |
| its-fine | 2.0.0 | MIT | [npm source archive](https://registry.npmjs.org/its-fine/-/its-fine-2.0.0.tgz) |
| jiti | 2.7.0 | MIT | [npm source archive](https://registry.npmjs.org/jiti/-/jiti-2.7.0.tgz) |
| js-tokens | 4.0.0 | MIT | [npm source archive](https://registry.npmjs.org/js-tokens/-/js-tokens-4.0.0.tgz) |
| jsdom | 29.1.1 | MIT | [npm source archive](https://registry.npmjs.org/jsdom/-/jsdom-29.1.1.tgz) |
| jsesc | 3.1.0 | MIT | [npm source archive](https://registry.npmjs.org/jsesc/-/jsesc-3.1.0.tgz) |
| json-buffer | 3.0.1 | MIT | [npm source archive](https://registry.npmjs.org/json-buffer/-/json-buffer-3.0.1.tgz) |
| json-schema-traverse | 0.4.1 | MIT | [npm source archive](https://registry.npmjs.org/json-schema-traverse/-/json-schema-traverse-0.4.1.tgz) |
| json-stable-stringify-without-jsonify | 1.0.1 | MIT | [npm source archive](https://registry.npmjs.org/json-stable-stringify-without-jsonify/-/json-stable-stringify-without-jsonify-1.0.1.tgz) |
| json5 | 2.2.3 | MIT | [npm source archive](https://registry.npmjs.org/json5/-/json5-2.2.3.tgz) |
| keyv | 4.5.4 | MIT | [npm source archive](https://registry.npmjs.org/keyv/-/keyv-4.5.4.tgz) |
| konva | 10.3.0 | MIT | [npm source archive](https://registry.npmjs.org/konva/-/konva-10.3.0.tgz) |
| levn | 0.4.1 | MIT | [npm source archive](https://registry.npmjs.org/levn/-/levn-0.4.1.tgz) |
| lightningcss | 1.32.0 | MPL-2.0 | [npm source archive](https://registry.npmjs.org/lightningcss/-/lightningcss-1.32.0.tgz) |
| lightningcss-win32-x64-msvc | 1.32.0 | MPL-2.0 | [npm source archive](https://registry.npmjs.org/lightningcss-win32-x64-msvc/-/lightningcss-win32-x64-msvc-1.32.0.tgz) |
| locate-path | 6.0.0 | MIT | [npm source archive](https://registry.npmjs.org/locate-path/-/locate-path-6.0.0.tgz) |
| lodash-es | 4.18.1 | MIT | [npm source archive](https://registry.npmjs.org/lodash-es/-/lodash-es-4.18.1.tgz) |
| lru-cache | 11.3.6 | BlueOak-1.0.0 | [npm source archive](https://registry.npmjs.org/lru-cache/-/lru-cache-11.3.6.tgz) |
| lru-cache | 5.1.1 | ISC | [npm source archive](https://registry.npmjs.org/lru-cache/-/lru-cache-5.1.1.tgz) |
| lucide-react | 1.14.0 | ISC | [npm source archive](https://registry.npmjs.org/lucide-react/-/lucide-react-1.14.0.tgz) |
| lz-string | 1.5.0 | MIT | [npm source archive](https://registry.npmjs.org/lz-string/-/lz-string-1.5.0.tgz) |
| magic-string | 0.30.21 | MIT | [npm source archive](https://registry.npmjs.org/magic-string/-/magic-string-0.30.21.tgz) |
| mdn-data | 2.27.1 | CC0-1.0 | [npm source archive](https://registry.npmjs.org/mdn-data/-/mdn-data-2.27.1.tgz) |
| min-indent | 1.0.1 | MIT | [npm source archive](https://registry.npmjs.org/min-indent/-/min-indent-1.0.1.tgz) |
| minimatch | 10.2.5 | BlueOak-1.0.0 | [npm source archive](https://registry.npmjs.org/minimatch/-/minimatch-10.2.5.tgz) |
| ms | 2.1.3 | MIT | [npm source archive](https://registry.npmjs.org/ms/-/ms-2.1.3.tgz) |
| nanoid | 3.3.12 | MIT | [npm source archive](https://registry.npmjs.org/nanoid/-/nanoid-3.3.12.tgz) |
| natural-compare | 1.4.0 | MIT | [npm source archive](https://registry.npmjs.org/natural-compare/-/natural-compare-1.4.0.tgz) |
| node-releases | 2.0.38 | MIT | [npm source archive](https://registry.npmjs.org/node-releases/-/node-releases-2.0.38.tgz) |
| normalize-path | 3.0.0 | MIT | [npm source archive](https://registry.npmjs.org/normalize-path/-/normalize-path-3.0.0.tgz) |
| obug | 2.1.1 | MIT | [npm source archive](https://registry.npmjs.org/obug/-/obug-2.1.1.tgz) |
| optionator | 0.9.4 | MIT | [npm source archive](https://registry.npmjs.org/optionator/-/optionator-0.9.4.tgz) |
| p-limit | 3.1.0 | MIT | [npm source archive](https://registry.npmjs.org/p-limit/-/p-limit-3.1.0.tgz) |
| p-locate | 5.0.0 | MIT | [npm source archive](https://registry.npmjs.org/p-locate/-/p-locate-5.0.0.tgz) |
| parse5 | 8.0.1 | MIT | [npm source archive](https://registry.npmjs.org/parse5/-/parse5-8.0.1.tgz) |
| path-exists | 4.0.0 | MIT | [npm source archive](https://registry.npmjs.org/path-exists/-/path-exists-4.0.0.tgz) |
| path-key | 3.1.1 | MIT | [npm source archive](https://registry.npmjs.org/path-key/-/path-key-3.1.1.tgz) |
| pathe | 2.0.3 | MIT | [npm source archive](https://registry.npmjs.org/pathe/-/pathe-2.0.3.tgz) |
| pdfjs-dist | 5.7.284 | Apache-2.0 | [npm source archive](https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-5.7.284.tgz) |
| picocolors | 1.1.1 | ISC | [npm source archive](https://registry.npmjs.org/picocolors/-/picocolors-1.1.1.tgz) |
| picomatch | 2.3.2 | MIT | [npm source archive](https://registry.npmjs.org/picomatch/-/picomatch-2.3.2.tgz) |
| picomatch | 4.0.4 | MIT | [npm source archive](https://registry.npmjs.org/picomatch/-/picomatch-4.0.4.tgz) |
| playwright | 1.60.0 | Apache-2.0 | [npm source archive](https://registry.npmjs.org/playwright/-/playwright-1.60.0.tgz) |
| playwright-core | 1.60.0 | Apache-2.0 | [npm source archive](https://registry.npmjs.org/playwright-core/-/playwright-core-1.60.0.tgz) |
| postcss | 8.5.14 | MIT | [npm source archive](https://registry.npmjs.org/postcss/-/postcss-8.5.14.tgz) |
| prelude-ls | 1.2.1 | MIT | [npm source archive](https://registry.npmjs.org/prelude-ls/-/prelude-ls-1.2.1.tgz) |
| prettier | 3.8.3 | MIT | [npm source archive](https://registry.npmjs.org/prettier/-/prettier-3.8.3.tgz) |
| prettier-plugin-tailwindcss | 0.8.0 | MIT | [npm source archive](https://registry.npmjs.org/prettier-plugin-tailwindcss/-/prettier-plugin-tailwindcss-0.8.0.tgz) |
| pretty-format | 27.5.1 | MIT | [npm source archive](https://registry.npmjs.org/pretty-format/-/pretty-format-27.5.1.tgz) |
| punycode | 2.3.1 | MIT | [npm source archive](https://registry.npmjs.org/punycode/-/punycode-2.3.1.tgz) |
| react | 19.2.6 | MIT | [npm source archive](https://registry.npmjs.org/react/-/react-19.2.6.tgz) |
| react-colorful | 5.7.0 | MIT | [npm source archive](https://registry.npmjs.org/react-colorful/-/react-colorful-5.7.0.tgz) |
| react-dom | 19.2.6 | MIT | [npm source archive](https://registry.npmjs.org/react-dom/-/react-dom-19.2.6.tgz) |
| react-error-boundary | 6.1.1 | MIT | [npm source archive](https://registry.npmjs.org/react-error-boundary/-/react-error-boundary-6.1.1.tgz) |
| react-i18next | 17.0.7 | MIT | [npm source archive](https://registry.npmjs.org/react-i18next/-/react-i18next-17.0.7.tgz) |
| react-is | 17.0.2 | MIT | [npm source archive](https://registry.npmjs.org/react-is/-/react-is-17.0.2.tgz) |
| react-konva | 19.2.4 | MIT | [npm source archive](https://registry.npmjs.org/react-konva/-/react-konva-19.2.4.tgz) |
| react-reconciler | 0.33.0 | MIT | [npm source archive](https://registry.npmjs.org/react-reconciler/-/react-reconciler-0.33.0.tgz) |
| react-refresh | 0.17.0 | MIT | [npm source archive](https://registry.npmjs.org/react-refresh/-/react-refresh-0.17.0.tgz) |
| react-remove-scroll | 2.7.2 | MIT | [npm source archive](https://registry.npmjs.org/react-remove-scroll/-/react-remove-scroll-2.7.2.tgz) |
| react-remove-scroll-bar | 2.3.8 | MIT | [npm source archive](https://registry.npmjs.org/react-remove-scroll-bar/-/react-remove-scroll-bar-2.3.8.tgz) |
| react-style-singleton | 2.2.3 | MIT | [npm source archive](https://registry.npmjs.org/react-style-singleton/-/react-style-singleton-2.2.3.tgz) |
| react-window | 2.2.7 | MIT | [npm source archive](https://registry.npmjs.org/react-window/-/react-window-2.2.7.tgz) |
| readdirp | 3.6.0 | MIT | [npm source archive](https://registry.npmjs.org/readdirp/-/readdirp-3.6.0.tgz) |
| redent | 3.0.0 | MIT | [npm source archive](https://registry.npmjs.org/redent/-/redent-3.0.0.tgz) |
| require-from-string | 2.0.2 | MIT | [npm source archive](https://registry.npmjs.org/require-from-string/-/require-from-string-2.0.2.tgz) |
| rollup | 4.60.3 | MIT | [npm source archive](https://registry.npmjs.org/rollup/-/rollup-4.60.3.tgz) |
| saxes | 6.0.0 | ISC | [npm source archive](https://registry.npmjs.org/saxes/-/saxes-6.0.0.tgz) |
| semver | 6.3.1 | ISC | [npm source archive](https://registry.npmjs.org/semver/-/semver-6.3.1.tgz) |
| semver | 7.8.0 | ISC | [npm source archive](https://registry.npmjs.org/semver/-/semver-7.8.0.tgz) |
| seroval | 1.5.4 | MIT | [npm source archive](https://registry.npmjs.org/seroval/-/seroval-1.5.4.tgz) |
| seroval-plugins | 1.5.4 | MIT | [npm source archive](https://registry.npmjs.org/seroval-plugins/-/seroval-plugins-1.5.4.tgz) |
| shebang-command | 2.0.0 | MIT | [npm source archive](https://registry.npmjs.org/shebang-command/-/shebang-command-2.0.0.tgz) |
| shebang-regex | 3.0.0 | MIT | [npm source archive](https://registry.npmjs.org/shebang-regex/-/shebang-regex-3.0.0.tgz) |
| scheduler | 0.27.0 | MIT | [npm source archive](https://registry.npmjs.org/scheduler/-/scheduler-0.27.0.tgz) |
| siginfo | 2.0.0 | ISC | [npm source archive](https://registry.npmjs.org/siginfo/-/siginfo-2.0.0.tgz) |
| source-map-js | 1.2.1 | BSD-3-Clause | [npm source archive](https://registry.npmjs.org/source-map-js/-/source-map-js-1.2.1.tgz) |
| stackback | 0.0.2 | MIT | [npm source archive](https://registry.npmjs.org/stackback/-/stackback-0.0.2.tgz) |
| std-env | 4.1.0 | MIT | [npm source archive](https://registry.npmjs.org/std-env/-/std-env-4.1.0.tgz) |
| strip-indent | 3.0.0 | MIT | [npm source archive](https://registry.npmjs.org/strip-indent/-/strip-indent-3.0.0.tgz) |
| symbol-tree | 3.2.4 | MIT | [npm source archive](https://registry.npmjs.org/symbol-tree/-/symbol-tree-3.2.4.tgz) |
| tailwind-merge | 3.5.0 | MIT | [npm source archive](https://registry.npmjs.org/tailwind-merge/-/tailwind-merge-3.5.0.tgz) |
| tailwindcss | 4.3.0 | MIT | [npm source archive](https://registry.npmjs.org/tailwindcss/-/tailwindcss-4.3.0.tgz) |
| tapable | 2.3.3 | MIT | [npm source archive](https://registry.npmjs.org/tapable/-/tapable-2.3.3.tgz) |
| tinybench | 2.9.0 | MIT | [npm source archive](https://registry.npmjs.org/tinybench/-/tinybench-2.9.0.tgz) |
| tinyexec | 1.1.2 | MIT | [npm source archive](https://registry.npmjs.org/tinyexec/-/tinyexec-1.1.2.tgz) |
| tinyglobby | 0.2.16 | MIT | [npm source archive](https://registry.npmjs.org/tinyglobby/-/tinyglobby-0.2.16.tgz) |
| tinyrainbow | 3.1.0 | MIT | [npm source archive](https://registry.npmjs.org/tinyrainbow/-/tinyrainbow-3.1.0.tgz) |
| tldts | 7.0.30 | MIT | [npm source archive](https://registry.npmjs.org/tldts/-/tldts-7.0.30.tgz) |
| tldts-core | 7.0.30 | MIT | [npm source archive](https://registry.npmjs.org/tldts-core/-/tldts-core-7.0.30.tgz) |
| to-regex-range | 5.0.1 | MIT | [npm source archive](https://registry.npmjs.org/to-regex-range/-/to-regex-range-5.0.1.tgz) |
| tough-cookie | 6.0.1 | BSD-3-Clause | [npm source archive](https://registry.npmjs.org/tough-cookie/-/tough-cookie-6.0.1.tgz) |
| tr46 | 6.0.0 | MIT | [npm source archive](https://registry.npmjs.org/tr46/-/tr46-6.0.0.tgz) |
| ts-api-utils | 2.5.0 | MIT | [npm source archive](https://registry.npmjs.org/ts-api-utils/-/ts-api-utils-2.5.0.tgz) |
| tslib | 2.8.1 | 0BSD | [npm source archive](https://registry.npmjs.org/tslib/-/tslib-2.8.1.tgz) |
| type-check | 0.4.0 | MIT | [npm source archive](https://registry.npmjs.org/type-check/-/type-check-0.4.0.tgz) |
| typescript | 5.6.3 | Apache-2.0 | [npm source archive](https://registry.npmjs.org/typescript/-/typescript-5.6.3.tgz) |
| typescript-eslint | 8.59.2 | MIT | [npm source archive](https://registry.npmjs.org/typescript-eslint/-/typescript-eslint-8.59.2.tgz) |
| undici | 7.25.0 | MIT | [npm source archive](https://registry.npmjs.org/undici/-/undici-7.25.0.tgz) |
| undici-types | 7.21.0 | MIT | [npm source archive](https://registry.npmjs.org/undici-types/-/undici-types-7.21.0.tgz) |
| unplugin | 3.0.0 | MIT | [npm source archive](https://registry.npmjs.org/unplugin/-/unplugin-3.0.0.tgz) |
| update-browserslist-db | 1.2.3 | MIT | [npm source archive](https://registry.npmjs.org/update-browserslist-db/-/update-browserslist-db-1.2.3.tgz) |
| uri-js | 4.4.1 | BSD-2-Clause | [npm source archive](https://registry.npmjs.org/uri-js/-/uri-js-4.4.1.tgz) |
| use-callback-ref | 1.3.3 | MIT | [npm source archive](https://registry.npmjs.org/use-callback-ref/-/use-callback-ref-1.3.3.tgz) |
| use-sidecar | 1.1.3 | MIT | [npm source archive](https://registry.npmjs.org/use-sidecar/-/use-sidecar-1.1.3.tgz) |
| use-sync-external-store | 1.6.0 | MIT | [npm source archive](https://registry.npmjs.org/use-sync-external-store/-/use-sync-external-store-1.6.0.tgz) |
| vite | 6.4.2 | MIT | [npm source archive](https://registry.npmjs.org/vite/-/vite-6.4.2.tgz) |
| vitest | 4.1.5 | MIT | [npm source archive](https://registry.npmjs.org/vitest/-/vitest-4.1.5.tgz) |
| vitest-axe | 0.1.0 | MIT | [npm source archive](https://registry.npmjs.org/vitest-axe/-/vitest-axe-0.1.0.tgz) |
| void-elements | 3.1.0 | MIT | [npm source archive](https://registry.npmjs.org/void-elements/-/void-elements-3.1.0.tgz) |
| w3c-xmlserializer | 5.0.0 | MIT | [npm source archive](https://registry.npmjs.org/w3c-xmlserializer/-/w3c-xmlserializer-5.0.0.tgz) |
| webidl-conversions | 8.0.1 | BSD-2-Clause | [npm source archive](https://registry.npmjs.org/webidl-conversions/-/webidl-conversions-8.0.1.tgz) |
| webpack-virtual-modules | 0.6.2 | MIT | [npm source archive](https://registry.npmjs.org/webpack-virtual-modules/-/webpack-virtual-modules-0.6.2.tgz) |
| whatwg-mimetype | 5.0.0 | MIT | [npm source archive](https://registry.npmjs.org/whatwg-mimetype/-/whatwg-mimetype-5.0.0.tgz) |
| whatwg-url | 16.0.1 | MIT | [npm source archive](https://registry.npmjs.org/whatwg-url/-/whatwg-url-16.0.1.tgz) |
| which | 2.0.2 | ISC | [npm source archive](https://registry.npmjs.org/which/-/which-2.0.2.tgz) |
| why-is-node-running | 2.3.0 | MIT | [npm source archive](https://registry.npmjs.org/why-is-node-running/-/why-is-node-running-2.3.0.tgz) |
| word-wrap | 1.2.5 | MIT | [npm source archive](https://registry.npmjs.org/word-wrap/-/word-wrap-1.2.5.tgz) |
| xml-name-validator | 5.0.0 | Apache-2.0 | [npm source archive](https://registry.npmjs.org/xml-name-validator/-/xml-name-validator-5.0.0.tgz) |
| xmlchars | 2.2.0 | MIT | [npm source archive](https://registry.npmjs.org/xmlchars/-/xmlchars-2.2.0.tgz) |
| yallist | 3.1.1 | ISC | [npm source archive](https://registry.npmjs.org/yallist/-/yallist-3.1.1.tgz) |
| yocto-queue | 0.1.0 | MIT | [npm source archive](https://registry.npmjs.org/yocto-queue/-/yocto-queue-0.1.0.tgz) |
| zod | 3.25.76 | MIT | [npm source archive](https://registry.npmjs.org/zod/-/zod-3.25.76.tgz) |
| zod | 4.4.3 | MIT | [npm source archive](https://registry.npmjs.org/zod/-/zod-4.4.3.tgz) |
| zod-validation-error | 4.0.2 | MIT | [npm source archive](https://registry.npmjs.org/zod-validation-error/-/zod-validation-error-4.0.2.tgz) |
| zustand | 4.5.7 | MIT | [npm source archive](https://registry.npmjs.org/zustand/-/zustand-4.5.7.tgz) |
| zustand | 5.0.13 | MIT | [npm source archive](https://registry.npmjs.org/zustand/-/zustand-5.0.13.tgz) |
