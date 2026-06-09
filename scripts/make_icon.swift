#!/usr/bin/env swift
// Generates AppIcon assets for Vani.
//
// Renders a 1024x1024 master PNG using Core Graphics, then writes every size
// required by macOS AppIcon (16/32/128/256/512 @1x and @2x).
//
// Usage:
//   swift scripts/make_icon.swift Vani/Resources/Assets.xcassets/AppIcon.appiconset

import AppKit
import CoreGraphics
import Foundation

let outDir: String
if CommandLine.arguments.count >= 2 {
    outDir = CommandLine.arguments[1]
} else {
    outDir = "Vani/Resources/Assets.xcassets/AppIcon.appiconset"
}

let fm = FileManager.default
try? fm.createDirectory(atPath: outDir, withIntermediateDirectories: true)

func render(size: Int) -> Data {
    let s = CGFloat(size)
    let bounds = CGRect(x: 0, y: 0, width: s, height: s)
    let cs = CGColorSpaceCreateDeviceRGB()
    guard let ctx = CGContext(
        data: nil,
        width: size,
        height: size,
        bitsPerComponent: 8,
        bytesPerRow: 0,
        space: cs,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else { fatalError("ctx") }

    let radius: CGFloat = s * 0.2237 // matches macOS Tahoe rounded-square shape
    let rounded = CGPath(roundedRect: bounds, cornerWidth: radius, cornerHeight: radius, transform: nil)
    ctx.addPath(rounded)
    ctx.clip()

    // Background gradient: deep indigo → magenta (matches a "voice/wave" feel).
    let colors = [
        CGColor(red: 0.10, green: 0.07, blue: 0.32, alpha: 1),
        CGColor(red: 0.45, green: 0.13, blue: 0.62, alpha: 1),
        CGColor(red: 0.93, green: 0.20, blue: 0.45, alpha: 1)
    ] as CFArray
    let stops: [CGFloat] = [0.0, 0.55, 1.0]
    let gradient = CGGradient(colorsSpace: cs, colors: colors, locations: stops)!
    ctx.drawLinearGradient(
        gradient,
        start: CGPoint(x: 0, y: s),
        end: CGPoint(x: s, y: 0),
        options: []
    )

    // Subtle highlight along the top-left.
    let highlight = CGGradient(
        colorsSpace: cs,
        colors: [
            CGColor(red: 1, green: 1, blue: 1, alpha: 0.18),
            CGColor(red: 1, green: 1, blue: 1, alpha: 0)
        ] as CFArray,
        locations: [0, 1]
    )!
    ctx.drawRadialGradient(
        highlight,
        startCenter: CGPoint(x: s * 0.25, y: s * 0.85),
        startRadius: 0,
        endCenter: CGPoint(x: s * 0.25, y: s * 0.85),
        endRadius: s * 0.6,
        options: []
    )

    // Decorative waveform behind the mic.
    ctx.saveGState()
    ctx.setLineCap(.round)
    ctx.setStrokeColor(CGColor(red: 1, green: 1, blue: 1, alpha: 0.18))
    let barCount = 7
    let barAreaWidth = s * 0.62
    let barSpacing = barAreaWidth / CGFloat(barCount - 1)
    let centerY = s * 0.5
    let amplitudes: [CGFloat] = [0.10, 0.22, 0.40, 0.56, 0.40, 0.22, 0.10]
    let barWidth = s * 0.025
    ctx.setLineWidth(barWidth)
    for i in 0..<barCount {
        let x = (s - barAreaWidth) / 2 + CGFloat(i) * barSpacing
        let h = s * amplitudes[i]
        ctx.move(to: CGPoint(x: x, y: centerY - h / 2))
        ctx.addLine(to: CGPoint(x: x, y: centerY + h / 2))
    }
    ctx.strokePath()
    ctx.restoreGState()

    // Foreground mic glyph.
    ctx.saveGState()
    let micColor = CGColor(red: 1, green: 1, blue: 1, alpha: 0.98)
    ctx.setFillColor(micColor)

    // Mic capsule.
    let capsuleWidth = s * 0.22
    let capsuleHeight = s * 0.36
    let capsuleX = (s - capsuleWidth) / 2
    let capsuleY = s * 0.34
    let capsuleRect = CGRect(x: capsuleX, y: capsuleY, width: capsuleWidth, height: capsuleHeight)
    let capsulePath = CGPath(
        roundedRect: capsuleRect,
        cornerWidth: capsuleWidth / 2,
        cornerHeight: capsuleWidth / 2,
        transform: nil
    )
    ctx.addPath(capsulePath)
    ctx.fillPath()

    // Mic arc + stand.
    ctx.setStrokeColor(micColor)
    ctx.setLineCap(.round)
    let stroke = s * 0.034
    ctx.setLineWidth(stroke)

    // Bottom arc under the capsule (the cradle).
    let arcRadius = s * 0.155
    let arcCenter = CGPoint(x: s / 2, y: capsuleY + capsuleHeight * 0.18)
    ctx.addArc(
        center: arcCenter,
        radius: arcRadius,
        startAngle: .pi,
        endAngle: 0,
        clockwise: true
    )
    ctx.strokePath()

    // Vertical stand.
    let standTop = arcCenter.y - arcRadius
    let standBottom = standTop - s * 0.07
    ctx.move(to: CGPoint(x: s / 2, y: standTop))
    ctx.addLine(to: CGPoint(x: s / 2, y: standBottom))
    ctx.strokePath()

    // Base bar.
    let baseY = standBottom
    let baseHalf = s * 0.08
    ctx.move(to: CGPoint(x: s / 2 - baseHalf, y: baseY))
    ctx.addLine(to: CGPoint(x: s / 2 + baseHalf, y: baseY))
    ctx.strokePath()

    ctx.restoreGState()

    guard let cgImage = ctx.makeImage() else { fatalError("image") }
    let rep = NSBitmapImageRep(cgImage: cgImage)
    guard let data = rep.representation(using: .png, properties: [:]) else { fatalError("png") }
    return data
}

struct Variant {
    let size: Int        // logical size in points
    let scale: Int       // 1 or 2
    var pixels: Int { size * scale }
    var fileName: String { "icon_\(size)x\(size)\(scale == 2 ? "@2x" : "").png" }
    var idiom: String { "mac" }
    var scaleString: String { "\(scale)x" }
}

let variants: [Variant] = [
    .init(size: 16,  scale: 1),
    .init(size: 16,  scale: 2),
    .init(size: 32,  scale: 1),
    .init(size: 32,  scale: 2),
    .init(size: 128, scale: 1),
    .init(size: 128, scale: 2),
    .init(size: 256, scale: 1),
    .init(size: 256, scale: 2),
    .init(size: 512, scale: 1),
    .init(size: 512, scale: 2)
]

for v in variants {
    let data = render(size: v.pixels)
    let path = "\(outDir)/\(v.fileName)"
    try data.write(to: URL(fileURLWithPath: path))
    print("wrote \(path) (\(v.pixels)px)")
}

// Contents.json describing the icon set.
let images: [[String: String]] = variants.map { v in
    [
        "idiom": v.idiom,
        "size": "\(v.size)x\(v.size)",
        "scale": v.scaleString,
        "filename": v.fileName
    ]
}
let contents: [String: Any] = [
    "images": images,
    "info": ["version": 1, "author": "vani"]
]
let json = try JSONSerialization.data(withJSONObject: contents, options: [.prettyPrinted, .sortedKeys])
try json.write(to: URL(fileURLWithPath: "\(outDir)/Contents.json"))
print("wrote \(outDir)/Contents.json")
