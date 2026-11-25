use tauri::{image::Image, AppHandle};

/// Renders crisp 36x36 (@2x Retina macOS menu bar) RGBA icons with transparent backgrounds
/// for all 4 VANI Menu Bar icon styles:
/// - "monochrome" (macOS native template image: auto-adapts white on dark bar / black on light bar)
/// - "accent"     (pink-to-violet VANI 5-bar waveform, no square box)
/// - "live-wave"  (native template when idle, glowing rose-pink bars when recording)
/// - "dot-wave"   (compact 3-bar icon + emerald/pink status dot)
pub fn build_tray_icon(style: &str, recording: bool) -> (Image<'static>, bool) {
    let w: u32 = 36;
    let h: u32 = 36;
    let mut rgba = vec![0u8; (w * h * 4) as usize];

    let use_template = if cfg!(target_os = "macos") {
        match style {
            "monochrome" => !recording,
            "live-wave" => !recording,
            "accent" | "dot-wave" => false,
            _ => !recording,
        }
    } else {
        false
    };

    let draw_rounded_bar = |buf: &mut [u8], cx: f32, cy: f32, bw: f32, bh: f32, color: [u8; 4]| {
        let half_w = bw / 2.0;
        let half_h = bh / 2.0;
        let radius = half_w;
        let x0 = (cx - half_w - 1.0).floor().max(0.0) as u32;
        let x1 = (cx + half_w + 1.0).ceil().min((w - 1) as f32) as u32;
        let y0 = (cy - half_h - 1.0).floor().max(0.0) as u32;
        let y1 = (cy + half_h + 1.0).ceil().min((h - 1) as f32) as u32;

        let inner_top = cy - half_h + radius;
        let inner_bot = cy + half_h - radius;

        for y in y0..=y1 {
            for x in x0..=x1 {
                let px = x as f32 + 0.5;
                let py = y as f32 + 0.5;
                let clamped_y = py.clamp(inner_top, inner_bot);
                let dx = px - cx;
                let dy = py - clamped_y;
                let dist = (dx * dx + dy * dy).sqrt();
                let coverage = (radius + 0.5 - dist).clamp(0.0, 1.0);
                if coverage > 0.0 {
                    let idx = ((y * w + x) * 4) as usize;
                    let a = (color[3] as f32 * coverage) as u8;
                    if a > buf[idx + 3] {
                        buf[idx] = color[0];
                        buf[idx + 1] = color[1];
                        buf[idx + 2] = color[2];
                        buf[idx + 3] = a;
                    }
                }
            }
        }
    };

    let draw_dot = |buf: &mut [u8], cx: f32, cy: f32, r: f32, color: [u8; 4]| {
        let x0 = (cx - r - 1.0).floor().max(0.0) as u32;
        let x1 = (cx + r + 1.0).ceil().min((w - 1) as f32) as u32;
        let y0 = (cy - r - 1.0).floor().max(0.0) as u32;
        let y1 = (cy + r + 1.0).ceil().min((h - 1) as f32) as u32;
        for y in y0..=y1 {
            for x in x0..=x1 {
                let dx = (x as f32 + 0.5) - cx;
                let dy = (y as f32 + 0.5) - cy;
                let dist = (dx * dx + dy * dy).sqrt();
                let cov = (r + 0.5 - dist).clamp(0.0, 1.0);
                if cov > 0.0 {
                    let idx = ((y * w + x) * 4) as usize;
                    let a = (color[3] as f32 * cov) as u8;
                    buf[idx] = color[0];
                    buf[idx + 1] = color[1];
                    buf[idx + 2] = color[2];
                    buf[idx + 3] = a.max(buf[idx + 3]);
                }
            }
        }
    };

    let cy = 18.0f32;
    let rose_colors: [[u8; 4]; 5] = [
        [249, 168, 212, 235],
        [244, 114, 182, 255],
        [236, 72, 153, 255],
        [192, 132, 252, 255],
        [167, 139, 250, 235],
    ];
    // macOS template icons use alpha mask (black); Windows/Linux tray icons render RGB directly.
    let mono_color: [u8; 4] = if cfg!(target_os = "macos") {
        [0, 0, 0, 255]
    } else {
        [244, 244, 248, 255]
    };

    if style == "dot-wave" {
        let xs = [11.0f32, 17.5, 24.0];
        let hs = if recording { [14.0, 24.0, 16.0] } else { [11.0, 20.0, 13.0] };
        let bar_col = if recording { [244, 114, 182, 255] } else { [244, 244, 246, 255] };
        for i in 0..3 {
            draw_rounded_bar(&mut rgba, xs[i], cy, 3.6, hs[i], bar_col);
        }
        let dot_col = if recording { [244, 114, 182, 255] } else { [52, 211, 153, 255] };
        draw_dot(&mut rgba, 29.5, 9.5, 3.6, dot_col);
    } else {
        let xs = [6.0f32, 12.0, 18.0, 24.0, 30.0];
        let hs = if recording {
            [14.0, 22.0, 28.0, 20.0, 14.0]
        } else {
            [10.0, 18.0, 26.0, 18.0, 10.0]
        };
        let is_mono_style = (style == "monochrome" || style == "live-wave" || (style != "accent" && style != "dot-wave")) && !recording;
        for i in 0..5 {
            let col = if is_mono_style { mono_color } else { rose_colors[i] };
            draw_rounded_bar(&mut rgba, xs[i], cy, 3.2, hs[i], col);
        }
        if recording && style == "live-wave" {
            draw_dot(&mut rgba, 31.5, 6.5, 3.2, [244, 114, 182, 255]);
        }
    }

    (Image::new_owned(rgba, w, h), use_template)
}

pub fn apply_tray_style(app: &AppHandle, style: &str, recording: bool) {
    if let Some(tray) = app.tray_by_id("vani-tray") {
        let (img, as_template) = build_tray_icon(style, recording);
        let _ = tray.set_icon(Some(img));
        let _ = tray.set_icon_as_template(as_template);
    }
}
