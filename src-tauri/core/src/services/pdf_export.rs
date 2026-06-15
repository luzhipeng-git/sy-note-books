//! Native PDF export: convert a single Markdown file to PDF using genpdf-chinese.
//!
//! Bypasses WebView's `window.print()`, generating PDF directly in Rust.
//! Images (PNG, JPEG, SVG→PNG) are embedded natively.

use std::fs;
use std::path::Path;

use genpdf_chinese::elements::{self, Image};
use genpdf_chinese::fonts::{self, FontData, FontFamily};
use genpdf_chinese::style::{Style, StyledString};
use genpdf_chinese::{Document, Scale, Size};
use pulldown_cmark::{Event, Options, Parser, Tag, TagEnd};

use super::export::svg_to_png_bytes;

// ═══════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════

/// Font references returned after registering with the Document.
struct Fonts {
    regular: FontFamily<fonts::Font>,
    mono: FontFamily<fonts::Font>,
}

/// Export a single Markdown file as a PDF document.
pub fn export_file_as_pdf(
    workspace_path: &Path,
    file_path: &str,
    output_path: &Path,
    title_override: Option<&str>,
    _author_override: Option<&str>,
) -> Result<(), String> {
    let md_abs = workspace_path.join(file_path);
    if !md_abs.exists() {
        return Err(format!("文件不存在：{}", file_path));
    }

    let md_content = fs::read_to_string(&md_abs)
        .map_err(|e| format!("读取 {} 失败：{e}", file_path))?;

    let md_dir = Path::new(file_path)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    // Load raw font data
    let regular_data = load_cjk_font().map_err(|e| format!("加载字体失败：{e}"))?;
    let mono_data = load_mono_font();

    // Create document with default font family
    let mut doc = Document::new(regular_data.clone());
    doc.set_title(
        title_override
            .map(|t| t.to_string())
            .unwrap_or_else(|| {
                Path::new(file_path)
                    .file_stem()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_else(|| "未命名".to_string())
            }),
    );
    doc.set_font_size(11);
    doc.set_line_spacing(1.4);
    doc.set_paper_size(Size::new(210.0, 297.0));

    // Register fonts with the document, get back Font references
    let fonts_regular = doc.add_font_family(regular_data);
    let fonts_mono = doc.add_font_family(mono_data);
    let fonts = Fonts { regular: fonts_regular, mono: fonts_mono };

    // Parse markdown and convert to PDF elements
    let mut converter = MdToPdfConverter::new(&fonts, workspace_path, &md_dir);
    let parser = Parser::new_ext(&md_content, pulldown_cmark_options());
    converter.convert(parser)?;

    for elem in converter.elements {
        doc.push(elem);
    }

    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建输出目录失败：{e}"))?;
    }
    doc.render_to_file(output_path)
        .map_err(|e| format!("PDF 渲染失败：{e}"))?;

    Ok(())
}

// ═══════════════════════════════════════════════════════════════
// Markdown → PDF converter
// ═══════════════════════════════════════════════════════════════

struct MdToPdfConverter<'a> {
    elements: Vec<Box<dyn genpdf_chinese::Element>>,
    fonts: &'a Fonts,
    workspace_path: &'a Path,
    md_dir: &'a str,
    code_block_lines: Vec<String>,
}

impl<'a> MdToPdfConverter<'a> {
    fn new(fonts: &'a Fonts, workspace_path: &'a Path, md_dir: &'a str) -> Self {
        Self {
            elements: Vec::new(),
            fonts,
            workspace_path,
            md_dir,
            code_block_lines: Vec::new(),
        }
    }

    fn convert<'b>(&mut self, events: impl Iterator<Item = Event<'b>>) -> Result<(), String> {
        let mut style_stack: Vec<Style> = Vec::new();
        let mut current_paragraph: Option<elements::Paragraph> = None;
        let mut in_heading: Option<u8> = None;
        let mut in_code_block = false;

        for event in events {
            match event {
                // ── Headings ──
                Event::Start(Tag::Heading { level, .. }) => {
                    self.flush_paragraph(&mut current_paragraph);
                    in_heading = Some(level as u8);
                    current_paragraph = Some(elements::Paragraph::new(""));
                }
                Event::End(TagEnd::Heading(_)) => {
                    if let Some(level) = in_heading.take() {
                        if let Some(para) = current_paragraph.take() {
                            let style = heading_style(level, &self.fonts.regular);
                            self.elements.push(Box::new(elements::StyledElement::new(para, style)));
                            self.elements.push(Box::new(elements::Break::new(0.5)));
                        }
                    }
                }

                // ── Paragraphs ──
                Event::Start(Tag::Paragraph) => {
                    self.flush_paragraph(&mut current_paragraph);
                    current_paragraph = Some(elements::Paragraph::new(""));
                }
                Event::End(TagEnd::Paragraph) => {
                    self.flush_paragraph(&mut current_paragraph);
                }

                // ── Bold / Italic ──
                Event::Start(Tag::Strong) => {
                    let mut s = Style::new();
                    s.set_font_family(self.fonts.regular.clone());
                    s.set_bold();
                    style_stack.push(s);
                }
                Event::End(TagEnd::Strong) => { style_stack.pop(); }

                Event::Start(Tag::Emphasis) => {
                    let mut s = Style::new();
                    s.set_font_family(self.fonts.regular.clone());
                    s.set_italic();
                    style_stack.push(s);
                }
                Event::End(TagEnd::Emphasis) => { style_stack.pop(); }

                // ── Inline code ──
                Event::Code(code) => {
                    let mut s = Style::new();
                    s.set_font_family(self.fonts.mono.clone());
                    s.set_font_size(9);
                    let ss = StyledString::new(code.to_string(), s, None);
                    self.push_styled_string(ss, &mut current_paragraph);
                }

                // ── Code blocks ──
                Event::Start(Tag::CodeBlock(_)) => {
                    self.flush_paragraph(&mut current_paragraph);
                    in_code_block = true;
                    self.code_block_lines.clear();
                }
                Event::End(TagEnd::CodeBlock) => {
                    in_code_block = false;
                    if !self.code_block_lines.is_empty() {
                        let text = self.code_block_lines.join("\n");
                        self.code_block_lines.clear();

                        let mut s = Style::new();
                        s.set_font_family(self.fonts.mono.clone());
                        s.set_font_size(8);

                        let mut para = elements::Paragraph::new("");
                        para.push_styled(text, s);

                        let padded = elements::PaddedElement::new(
                            para,
                            genpdf_chinese::Margins::vh(3.0, 4.0),
                        );
                        self.elements.push(Box::new(padded));
                        self.elements.push(Box::new(elements::Break::new(0.3)));
                    }
                }

                // ── Lists ──
                Event::Start(Tag::List(_)) => {
                    self.flush_paragraph(&mut current_paragraph);
                }
                Event::End(TagEnd::List(_)) => {}
                Event::Start(Tag::Item) => {
                    self.flush_paragraph(&mut current_paragraph);
                    current_paragraph = Some(elements::Paragraph::new("  • "));
                }
                Event::End(TagEnd::Item) => {
                    self.flush_paragraph(&mut current_paragraph);
                }

                // ── Block quotes ──
                Event::Start(Tag::BlockQuote(_)) => {
                    self.flush_paragraph(&mut current_paragraph);
                }
                Event::End(TagEnd::BlockQuote) => {}

                // ── Tables ──
                Event::Start(Tag::Table(_)) => {
                    self.flush_paragraph(&mut current_paragraph);
                }
                Event::End(TagEnd::Table) => {}
                Event::Start(Tag::TableHead) => {
                    self.flush_paragraph(&mut current_paragraph);
                    current_paragraph = Some(elements::Paragraph::new(""));
                }
                Event::End(TagEnd::TableHead) => {
                    if let Some(para) = current_paragraph.take() {
                        let style = heading_style(3, &self.fonts.regular);
                        self.elements.push(Box::new(elements::StyledElement::new(para, style)));
                    }
                }
                Event::Start(Tag::TableRow) => {
                    current_paragraph = Some(elements::Paragraph::new(""));
                }
                Event::End(TagEnd::TableRow) => {
                    if let Some(para) = current_paragraph.take() {
                        self.elements.push(Box::new(para));
                    }
                }
                Event::Start(Tag::TableCell) => {}
                Event::End(TagEnd::TableCell) => {
                    if let Some(ref mut para) = current_paragraph {
                        para.push(" | ");
                    }
                }

                // ── Images ──
                Event::Start(Tag::Image { dest_url, .. }) => {
                    self.flush_paragraph(&mut current_paragraph);
                    if let Some(img_elem) = self.resolve_image(&dest_url) {
                        self.elements.push(Box::new(img_elem));
                        self.elements.push(Box::new(elements::Break::new(0.3)));
                    }
                }
                Event::End(TagEnd::Image) => {}

                // ── Line breaks ──
                Event::SoftBreak => {
                    if let Some(ref mut para) = current_paragraph {
                        para.push(" ");
                    }
                }
                Event::HardBreak => {
                    self.flush_paragraph(&mut current_paragraph);
                }

                // ── Horizontal rule ──
                Event::Rule => {
                    self.flush_paragraph(&mut current_paragraph);
                    self.elements.push(Box::new(elements::Break::new(1.0)));
                }

                // ── Task list markers ──
                Event::TaskListMarker(checked) => {
                    let marker = if checked { "☑ " } else { "☐ " };
                    if let Some(ref mut para) = current_paragraph {
                        para.push(marker);
                    }
                }

                // ── Text ──
                Event::Text(text) => {
                    if in_code_block {
                        self.code_block_lines.push(text.to_string());
                    } else {
                        let ss = if let Some(style) = style_stack.last() {
                            StyledString::new(text.to_string(), style.clone(), None)
                        } else {
                            let mut s = Style::new();
                            s.set_font_family(self.fonts.regular.clone());
                            StyledString::new(text.to_string(), s, None)
                        };
                        self.push_styled_string(ss, &mut current_paragraph);
                    }
                }

                // ── Ignored events ──
                Event::Html(_) | Event::InlineHtml(_) => {}
                Event::Start(Tag::Strikethrough) => {
                    let mut s = Style::new();
                    s.set_font_family(self.fonts.regular.clone());
                    style_stack.push(s);
                }
                Event::End(TagEnd::Strikethrough) => { style_stack.pop(); }
                Event::Start(Tag::Link { .. }) => {}
                Event::End(TagEnd::Link) => {}
                Event::FootnoteReference(_) => {}
                Event::Start(Tag::FootnoteDefinition(_)) => {}
                Event::End(TagEnd::FootnoteDefinition) => {}
                Event::Start(Tag::MetadataBlock(_)) => {}
                Event::End(TagEnd::MetadataBlock(_)) => {}
                Event::InlineMath(_) | Event::DisplayMath(_) => {}
                Event::Start(Tag::HtmlBlock) | Event::End(TagEnd::HtmlBlock) => {}
            }
        }

        self.flush_paragraph(&mut current_paragraph);
        Ok(())
    }

    fn flush_paragraph(&mut self, paragraph: &mut Option<elements::Paragraph>) {
        if let Some(para) = paragraph.take() {
            self.elements.push(Box::new(para));
        }
    }

    fn push_styled_string(&mut self, s: StyledString, paragraph: &mut Option<elements::Paragraph>) {
        if paragraph.is_none() {
            *paragraph = Some(elements::Paragraph::new(""));
        }
        if let Some(ref mut para) = paragraph {
            para.push(s);
        }
    }

    fn resolve_image(&self, src: &str) -> Option<Image> {
        let file_path = resolve_image_path(src, self.workspace_path, self.md_dir)?;

        let data = if file_path.extension().map_or(false, |e| e == "svg") {
            let svg_data = fs::read(&file_path).ok()?;
            svg_to_png_bytes(&svg_data)?
        } else {
            fs::read(&file_path).ok()?
        };

        // Load and convert to RGB (genpdf rejects alpha channel)
        let img = image::load_from_memory(&data).ok()?.to_rgb8();
        let dyn_img = image::DynamicImage::ImageRgb8(img);

        let mut pdf_img = Image::from_dynamic_image(dyn_img).ok()?;

        // Scale down if wider than ~160mm (A4 content area at 300 DPI)
        let mmpi = 25.4;
        let loaded = image::load_from_memory(&data).ok()?;
        let (w, _h) = (loaded.width(), loaded.height());
        let img_width_mm = mmpi * (w as f32) / 300.0;
        if img_width_mm > 160.0 {
            let scale = 160.0 / img_width_mm;
            pdf_img.set_scale(Scale::new(scale, scale));
        }

        Some(pdf_img)
    }
}

// ═══════════════════════════════════════════════════════════════
// Image path resolution
// ═══════════════════════════════════════════════════════════════

fn resolve_image_path(src: &str, workspace_path: &Path, md_dir: &str) -> Option<std::path::PathBuf> {
    use percent_encoding::percent_decode_str;

    if src.starts_with("http") || src.starts_with("data:") || src.starts_with("blob:") {
        return None;
    }

    if src.starts_with("asset://localhost/") {
        let decoded = percent_decode_str(&src["asset://localhost/".len()..])
            .decode_utf8_lossy()
            .to_string();
        let owned;
        let fs_path = if !decoded.starts_with('/') && !decoded.contains(':') {
            owned = format!("/{decoded}");
            Path::new(&owned)
        } else {
            Path::new(&decoded)
        };
        Some(fs_path.to_path_buf())
    } else if src.starts_with('/') {
        Some(Path::new(src).to_path_buf())
    } else {
        let relative = src.trim_start_matches("./");
        if md_dir.is_empty() {
            Some(workspace_path.join(relative))
        } else {
            Some(workspace_path.join(md_dir).join(relative))
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// Font loading
// ═══════════════════════════════════════════════════════════════

const CJK_FONT_PATHS: &[(&str, &str)] = &[
    // Fedora (google-noto-sans-cjk-fonts package)
    ("/usr/share/fonts/google-noto-sans-cjk-fonts/NotoSansCJK-Regular.ttc",
     "/usr/share/fonts/google-noto-sans-cjk-fonts/NotoSansCJK-Bold.ttc"),
    // RHEL / CentOS (google-noto-cjk package)
    ("/usr/share/fonts/google-noto-cjk/NotoSansCJK-Regular.ttc",
     "/usr/share/fonts/google-noto-cjk/NotoSansCJK-Bold.ttc"),
    // Ubuntu / Debian (fonts-noto-cjk package)
    ("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
     "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"),
    // Android / minimal Linux — TrueType fallback for systems without NotoSansCJK
    ("/usr/share/fonts/google-droid-sans-fonts/DroidSansFallbackFull.ttf",
     "/usr/share/fonts/google-droid-sans-fonts/DroidSansFallbackFull.ttf"),
    // macOS
    ("/System/Library/Fonts/STHeiti Light.ttc",
     "/System/Library/Fonts/STHeiti Medium.ttc"),
    ("/Library/Fonts/Arial Unicode.ttf",
     "/Library/Fonts/Arial Unicode.ttf"),
    // Windows
    ("C:\\Windows\\Fonts\\msyh.ttc",
     "C:\\Windows\\Fonts\\msyhbd.ttc"),
];

const MONO_FONT_PATHS: &[&str] = &[
    "/usr/share/fonts/dejavu-sans-mono-fonts/DejaVuSansMono.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    "/usr/share/fonts/liberation-mono/LiberationMono-Regular.ttf",
    "/System/Library/Fonts/Menlo.ttc",
    "C:\\Windows\\Fonts\\consola.ttf",
];

fn load_cjk_font() -> Result<FontFamily<FontData>, String> {
    for (regular_path, bold_path) in CJK_FONT_PATHS {
        if Path::new(regular_path).exists() {
            if let Ok(font) = load_font_family(regular_path, bold_path) {
                return Ok(font);
            }
        }
    }
    Err("未找到可用的中文字体。请安装 NotoSansCJK 或 DroidSansFallbackFull 字体。".to_string())
}

fn load_mono_font() -> FontFamily<FontData> {
    for path in MONO_FONT_PATHS {
        if Path::new(path).exists() {
            if let Ok(data) = load_single_font(path) {
                let bold_path = path
                    .replace("Mono.ttf", "Mono-Bold.ttf")
                    .replace("Mono-Regular", "Mono-Bold");
                let bold = if Path::new(&bold_path).exists() {
                    load_single_font(&bold_path).unwrap_or_else(|_| data.clone())
                } else {
                    data.clone()
                };
                let italic = data.clone();
                let bold_italic = bold.clone();
                return FontFamily { regular: data, bold, italic, bold_italic };
            }
        }
    }
    // Last resort
    load_single_font("/usr/share/fonts/dejavu-sans-fonts/DejaVuSans.ttf")
        .map(|data| FontFamily {
            regular: data.clone(),
            bold: data.clone(),
            italic: data.clone(),
            bold_italic: data,
        })
        .unwrap_or_else(|_| panic!("无法加载任何字体"))
}

fn load_font_family(regular_path: &str, bold_path: &str) -> Result<FontFamily<FontData>, String> {
    let regular = load_single_font(regular_path)?;
    let bold = if Path::new(bold_path).exists() {
        load_single_font(bold_path).unwrap_or_else(|_| regular.clone())
    } else {
        regular.clone()
    };
    let italic = regular.clone();
    let bold_italic = bold.clone();
    Ok(FontFamily { regular, bold, italic, bold_italic })
}

/// Load a font from .ttf/.otf/.ttc.
///
/// ab_glyph's `FontVec::try_from_vec_and_index(data, 0)` (used inside
/// `FontData::new`) natively parses multi-font TTC collections by selecting the
/// first font, so NotoSansCJK / macOS STHeiti / Windows msyh all load without a
/// special case. No separate TTC validation is needed.
fn load_single_font(path: &str) -> Result<FontData, String> {
    let data = fs::read(path).map_err(|e| format!("读取字体 {} 失败：{e}", path))?;
    FontData::new(data, None).map_err(|e| format!("加载字体 {} 失败：{e}", path))
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

fn heading_style(level: u8, font: &FontFamily<fonts::Font>) -> Style {
    let size = match level {
        1 => 22,
        2 => 16,
        3 => 13,
        _ => 11,
    };
    let mut s = Style::new();
    s.set_font_family(font.clone());
    s.set_bold();
    s.set_font_size(size);
    s
}

fn pulldown_cmark_options() -> Options {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_FOOTNOTES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TASKLISTS);
    options
}

// ═══════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::workspace;
    use tempfile::TempDir;

    fn setup_test_workspace(dir: &Path) {
        workspace::create_workspace(dir, "测试文档", "测试作者", Some("zh-CN")).unwrap();
        let ch1 = dir.join("01-intro");
        fs::create_dir_all(ch1.join("assets")).unwrap();
        fs::write(ch1.join("index.md"), "# 入门指南\n\n欢迎使用本书。\n").unwrap();
        let summary = "# 测试文档\n- [入门指南](01-intro/index.md)\n";
        fs::write(dir.join("SUMMARY.md"), summary).unwrap();
    }

    fn assert_valid_pdf(path: &Path) {
        assert!(path.exists(), "PDF file should exist");
        let data = fs::read(path).unwrap();
        assert!(data.starts_with(b"%PDF-"), "Output should be a valid PDF");
        assert!(data.len() > 500, "PDF should be non-trivial, got {} bytes", data.len());
    }

    #[test]
    fn export_file_as_pdf_basic_markdown() {
        let tmp = TempDir::new().unwrap();
        let ws = tmp.path().join("ws");
        setup_test_workspace(&ws);
        let out = tmp.path().join("output.pdf");
        let result = export_file_as_pdf(&ws, "01-intro/index.md", &out, None, None);
        assert!(result.is_ok(), "export failed: {:?}", result);
        assert_valid_pdf(&out);
    }

    #[test]
    fn export_file_as_pdf_rich_content() {
        let tmp = TempDir::new().unwrap();
        let ws = tmp.path().join("ws");
        setup_test_workspace(&ws);
        let md = "# 主标题\n\n## 二级标题\n\n正文，包含**粗体**和*斜体*。\n\n### 三级标题\n\n- 项目一\n- 项目二\n\n```\nlet x = 1;\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |\n";
        fs::write(ws.join("rich.md"), md).unwrap();
        let out = tmp.path().join("output.pdf");
        let result = export_file_as_pdf(&ws, "rich.md", &out, None, None);
        assert!(result.is_ok(), "export failed: {:?}", result);
        assert_valid_pdf(&out);
    }

    #[test]
    fn export_file_as_pdf_chinese_text() {
        let tmp = TempDir::new().unwrap();
        let ws = tmp.path().join("ws");
        setup_test_workspace(&ws);
        let md = "# 中文测试\n\n这是一段中文文字。\n\n包含**粗体中文**和*斜体中文*。\n\n- 列表项目一\n- 列表项目二\n";
        fs::write(ws.join("chinese.md"), md).unwrap();
        let out = tmp.path().join("output.pdf");
        let result = export_file_as_pdf(&ws, "chinese.md", &out, None, None);
        assert!(result.is_ok(), "export failed: {:?}", result);
        assert_valid_pdf(&out);
    }

    #[test]
    fn export_file_as_pdf_missing_file() {
        let tmp = TempDir::new().unwrap();
        let ws = tmp.path().join("ws");
        setup_test_workspace(&ws);
        let out = tmp.path().join("output.pdf");
        let result = export_file_as_pdf(&ws, "nonexistent.md", &out, None, None);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("不存在"));
    }

    #[test]
    fn export_file_as_pdf_with_title_override() {
        let tmp = TempDir::new().unwrap();
        let ws = tmp.path().join("ws");
        setup_test_workspace(&ws);
        let out = tmp.path().join("output.pdf");
        let result = export_file_as_pdf(&ws, "01-intro/index.md", &out, Some("自定义标题"), None);
        assert!(result.is_ok(), "export failed: {:?}", result);
        assert_valid_pdf(&out);
    }

    // ── Extended tests for cross-platform verification ──

    #[test]
    fn export_file_as_pdf_tables() {
        let tmp = TempDir::new().unwrap();
        let ws = tmp.path().join("ws");
        setup_test_workspace(&ws);
        let md = "# 表格测试\n\n| 列A | 列B | 列C |\n|-----|-----|-----|\n| 数据1 | 数据2 | 数据3 |\n| 中文1 | 中文2 | 中文3 |\n\n多列表格导出。\n";
        fs::write(ws.join("tables.md"), md).unwrap();
        let out = tmp.path().join("output.pdf");
        let result = export_file_as_pdf(&ws, "tables.md", &out, None, None);
        assert!(result.is_ok(), "export failed: {:?}", result);
        assert_valid_pdf(&out);
    }

    #[test]
    fn export_file_as_pdf_task_list() {
        let tmp = TempDir::new().unwrap();
        let ws = tmp.path().join("ws");
        setup_test_workspace(&ws);
        let md = "# 任务列表\n\n- [x] 已完成任务\n- [ ] 未完成任务\n- [x] 另一个完成项\n\n普通文本。\n";
        fs::write(ws.join("tasks.md"), md).unwrap();
        let out = tmp.path().join("output.pdf");
        let result = export_file_as_pdf(&ws, "tasks.md", &out, None, None);
        assert!(result.is_ok(), "export failed: {:?}", result);
        assert_valid_pdf(&out);
    }

    #[test]
    fn export_file_as_pdf_mixed_heading_levels() {
        let tmp = TempDir::new().unwrap();
        let ws = tmp.path().join("ws");
        setup_test_workspace(&ws);
        let md = "# H1 标题\n\n## H2 标题\n\n### H3 标题\n\n#### H4 标题\n\n##### H5 标题\n\n各层级标题正文。\n";
        fs::write(ws.join("headings.md"), md).unwrap();
        let out = tmp.path().join("output.pdf");
        let result = export_file_as_pdf(&ws, "headings.md", &out, None, None);
        assert!(result.is_ok(), "export failed: {:?}", result);
        assert_valid_pdf(&out);
    }

    #[test]
    fn export_file_as_pdf_code_block_with_language() {
        let tmp = TempDir::new().unwrap();
        let ws = tmp.path().join("ws");
        setup_test_workspace(&ws);
        let md = "# 代码块测试\n\n```rust\nfn main() {\n    println!(\"Hello, 世界！\");\n}\n```\n\n```javascript\nconst x = 42;\nconsole.log(x);\n```\n";
        fs::write(ws.join("code.md"), md).unwrap();
        let out = tmp.path().join("output.pdf");
        let result = export_file_as_pdf(&ws, "code.md", &out, None, None);
        assert!(result.is_ok(), "export failed: {:?}", result);
        assert_valid_pdf(&out);
    }

    #[test]
    fn export_file_as_pdf_inline_code() {
        let tmp = TempDir::new().unwrap();
        let ws = tmp.path().join("ws");
        setup_test_workspace(&ws);
        let md = "# 行内代码\n\n使用 `cargo test` 运行测试。`Rust` 是一门系统编程语言。\n";
        fs::write(ws.join("inline-code.md"), md).unwrap();
        let out = tmp.path().join("output.pdf");
        let result = export_file_as_pdf(&ws, "inline-code.md", &out, None, None);
        assert!(result.is_ok(), "export failed: {:?}", result);
        assert_valid_pdf(&out);
    }

    #[test]
    fn export_file_as_pdf_strikethrough() {
        let tmp = TempDir::new().unwrap();
        let ws = tmp.path().join("ws");
        setup_test_workspace(&ws);
        let md = "# 删除线\n\n~~这段文字被删除了~~\n\n正常文本和~~删除~~混排。\n";
        fs::write(ws.join("strike.md"), md).unwrap();
        let out = tmp.path().join("output.pdf");
        let result = export_file_as_pdf(&ws, "strike.md", &out, None, None);
        assert!(result.is_ok(), "export failed: {:?}", result);
        assert_valid_pdf(&out);
    }

    #[test]
    fn export_file_as_pdf_horizontal_rule() {
        let tmp = TempDir::new().unwrap();
        let ws = tmp.path().join("ws");
        setup_test_workspace(&ws);
        let md = "# 分隔线\n\n上部分内容\n\n---\n\n下部分内容\n";
        fs::write(ws.join("rule.md"), md).unwrap();
        let out = tmp.path().join("output.pdf");
        let result = export_file_as_pdf(&ws, "rule.md", &out, None, None);
        assert!(result.is_ok(), "export failed: {:?}", result);
        assert_valid_pdf(&out);
    }

    #[test]
    fn export_file_as_pdf_embedded_png_image() {
        let tmp = TempDir::new().unwrap();
        let ws = tmp.path().join("ws");
        setup_test_workspace(&ws);
        // Create a small PNG image (1x1 red pixel)
        let assets_dir = ws.join("assets");
        fs::create_dir_all(&assets_dir).unwrap();
        // Minimal valid PNG: 1x1 red pixel
        let png_bytes: [u8; 69] = [
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1
            0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, // 8-bit RGB
            0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, // IDAT chunk
            0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00, // compressed data
            0x00, 0x00, 0x02, 0x00, 0x01, 0xE2, 0x21, 0xBC, // CRC
            0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, // IEND chunk
            0x44, 0xAE, 0x42, 0x60, 0x82,                     // CRC
        ];
        fs::write(assets_dir.join("test.png"), png_bytes).unwrap();
        let md = "# 图片测试\n\n![测试图片](assets/test.png)\n\n图片后文本。\n";
        fs::write(ws.join("image.md"), md).unwrap();
        let out = tmp.path().join("output.pdf");
        let result = export_file_as_pdf(&ws, "image.md", &out, None, None);
        assert!(result.is_ok(), "export failed: {:?}", result);
        assert_valid_pdf(&out);
    }

    #[test]
    fn export_file_as_pdf_long_document() {
        let tmp = TempDir::new().unwrap();
        let ws = tmp.path().join("ws");
        setup_test_workspace(&ws);
        // Generate a multi-page document
        let mut md = String::from("# 长文档测试\n\n");
        for i in 1..=50 {
            md.push_str(&format!("## 第 {} 节\n\n这是第 {} 节的内容。包含一些中文文字和 English text。\n\n", i, i));
            if i % 5 == 0 {
                md.push_str(&format!("```\nfn function_{}() {{\n    let x = {};\n}}\n```\n\n", i, i));
            }
        }
        fs::write(ws.join("long.md"), md).unwrap();
        let out = tmp.path().join("output.pdf");
        let result = export_file_as_pdf(&ws, "long.md", &out, None, None);
        assert!(result.is_ok(), "export failed: {:?}", result);
        assert_valid_pdf(&out);
        // Long document should produce a substantial PDF
        let data = fs::read(&out).unwrap();
        assert!(data.len() > 5000, "Long document PDF should be substantial, got {} bytes", data.len());
    }

    #[test]
    fn export_file_as_pdf_empty_document() {
        let tmp = TempDir::new().unwrap();
        let ws = tmp.path().join("ws");
        setup_test_workspace(&ws);
        fs::write(ws.join("empty.md"), "").unwrap();
        let out = tmp.path().join("output.pdf");
        let result = export_file_as_pdf(&ws, "empty.md", &out, None, None);
        assert!(result.is_ok(), "export failed: {:?}", result);
        assert_valid_pdf(&out);
    }

    #[test]
    fn export_file_as_pdf_mixed_chinese_english() {
        let tmp = TempDir::new().unwrap();
        let ws = tmp.path().join("ws");
        setup_test_workspace(&ws);
        let md = "# 中英混排测试\n\nThis is English text with 中文混合。\n\n- English item with 中文描述\n- **Bold中文** and *italic English*\n- `code中英混排` inline\n\n```\n// 代码中的中文注释\nlet msg = \"你好世界\";\n```\n";
        fs::write(ws.join("mixed.md"), md).unwrap();
        let out = tmp.path().join("output.pdf");
        let result = export_file_as_pdf(&ws, "mixed.md", &out, None, None);
        assert!(result.is_ok(), "export failed: {:?}", result);
        assert_valid_pdf(&out);
    }

    #[test]
    fn export_file_as_pdf_output_dir_creation() {
        let tmp = TempDir::new().unwrap();
        let ws = tmp.path().join("ws");
        setup_test_workspace(&ws);
        let md = "# 目录创建测试\n\n测试输出目录自动创建。\n";
        fs::write(ws.join("dir-test.md"), md).unwrap();
        let out = tmp.path().join("nested").join("output").join("output.pdf");
        let result = export_file_as_pdf(&ws, "dir-test.md", &out, None, None);
        assert!(result.is_ok(), "export failed: {:?}", result);
        assert_valid_pdf(&out);
    }
}
