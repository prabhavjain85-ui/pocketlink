#!/usr/bin/env python3
"""
Generates public/social-preview.png (1200x630) using ImageMagick for Target Forge social sharing.
"""
import subprocess
import os

def build_social_preview():
    output_png = "public/social-preview.png"
    
    # We construct an ImageMagick draw command
    # Colors:
    # bg: #070d18
    # inner card: #0f172a
    # border: #334155
    # accent cyan: #0ea5e9, light cyan: #38bdf8
    # accent emerald: #10b981, light emerald: #34d399
    # text white: #ffffff, text muted: #94a3b8, text slate: #cbd5e1

    draw_ops = []

    # 1. Subtle background grid
    for x in range(60, 1200, 60):
        draw_ops.append(f"stroke '#1e293b' stroke-width 1 stroke-opacity 0.4 line {x},20 {x},610")
    for y in range(60, 630, 60):
        draw_ops.append(f"stroke '#1e293b' stroke-width 1 stroke-opacity 0.4 line 20,{y} 1180,{y}")

    # 2. Outer rounded border frame
    draw_ops.append("stroke '#334155' stroke-width 2 fill 'none' roundrectangle 24,24 1176,606 16,16")
    draw_ops.append("stroke '#1e293b' stroke-width 1 fill 'none' roundrectangle 32,32 1168,598 12,12")

    # Corner crosshair marks
    draw_ops.append("stroke '#38bdf8' stroke-width 2 line 24,44 44,44 line 44,24 44,44")
    draw_ops.append("stroke '#38bdf8' stroke-width 2 line 1156,44 1176,44 line 1156,24 1156,44")
    draw_ops.append("stroke '#38bdf8' stroke-width 2 line 24,586 44,586 line 44,586 44,606")
    draw_ops.append("stroke '#38bdf8' stroke-width 2 line 1156,586 1176,586 line 1156,586 1156,606")

    # 3. Top category pill badge
    draw_ops.append("stroke '#334155' stroke-width 1 fill '#1e293b' roundrectangle 72,70 360,104 17,17")
    draw_ops.append("stroke 'none' fill '#10b981' circle 90,87 90,92")
    draw_ops.append("stroke 'none' fill '#94a3b8' font Helvetica-Bold font-size 12 text 106,91 'DRUG DISCOVERY & REPURPOSING'")

    # 4. Target Forge Brand Icon Lockup
    # Icon background
    draw_ops.append("stroke '#334155' stroke-width 1.5 fill '#0f172a' roundrectangle 72,130 142,200 16,16")
    # Outer dashed ring
    draw_ops.append("stroke '#0ea5e9' stroke-width 2.5 fill 'none' circle 107,165 107,187")
    # Inner ring
    draw_ops.append("stroke '#ffffff' stroke-width 2 fill 'none' circle 107,165 107,179")
    # Crosshairs
    draw_ops.append("stroke '#10b981' stroke-width 2.5 line 107,135 107,147 line 107,183 107,195 line 77,165 89,165 line 125,165 137,165")
    # Center atom core
    draw_ops.append("stroke 'none' fill '#10b981' circle 107,165 107,171")

    # Brand Title: "Target Forge"
    draw_ops.append("stroke 'none' fill '#ffffff' font Helvetica-Bold font-size 54 text 164,182 'Target Forge'")

    # Headline: "AI-Powered Drug Discovery Platform"
    draw_ops.append("stroke 'none' fill '#38bdf8' font Helvetica-Bold font-size 30 text 72,252 'AI-Powered Drug Discovery Platform'")

    # Tagline / Subtitle
    draw_ops.append("stroke 'none' fill '#cbd5e1' font Helvetica font-size 18 text 72,298 'AI-powered drug discovery platform for drug repurposing, target'")
    draw_ops.append("stroke 'none' fill '#cbd5e1' font Helvetica font-size 18 text 72,326 'identification, molecular docking, ADME analysis, and automated research.'")

    # Capability Badges
    badges = [
        ("Target Validation", 72, 385, 235),
        ("Drug Repurposing", 247, 385, 415),
        ("Molecular Docking", 427, 385, 595),
        ("ADME Profiling", 72, 435, 235),
        ("Autonomous Agent", 247, 435, 415),
        ("targetforge.in", 427, 435, 595),
    ]
    for label, x1, y1, x2 in badges:
        is_domain = (label == "targetforge.in")
        border_col = "#0ea5e9" if is_domain else "#334155"
        fill_col = "#0f172a" if is_domain else "#1e293b"
        text_col = "#38bdf8" if is_domain else "#e2e8f0"
        font_name = "Helvetica-Bold" if is_domain else "Helvetica"
        draw_ops.append(f"stroke '{border_col}' stroke-width 1 fill '{fill_col}' roundrectangle {x1},{y1} {x2},{y1+36} 8,8")
        if not is_domain:
            dot_col = "#10b981" if "Repurposing" in label else ("#6366f1" if "Docking" in label else "#0ea5e9")
            draw_ops.append(f"stroke 'none' fill '{dot_col}' circle {x1+16},{y1+18} {x1+16},{y1+22}")
            draw_ops.append(f"stroke 'none' fill '{text_col}' font {font_name} font-size 13 text {x1+28},{y1+23} '{label}'")
        else:
            draw_ops.append(f"stroke 'none' fill '{text_col}' font {font_name} font-size 13 text {x1+36},{y1+23} '{label}'")

    # 5. RIGHT SIDE: Molecular & Binding Site Visualization
    # Pocket circles
    draw_ops.append("stroke '#0ea5e9' stroke-width 1.5 stroke-opacity 0.25 fill 'none' circle 940,290 940,480")
    draw_ops.append("stroke '#10b981' stroke-width 1.5 stroke-opacity 0.3 fill 'none' circle 940,290 940,420")
    draw_ops.append("stroke '#38bdf8' stroke-width 1 stroke-opacity 0.35 fill 'none' circle 940,290 940,360")

    # Pocket crosshair
    draw_ops.append("stroke '#0ea5e9' stroke-width 1 stroke-opacity 0.2 line 740,290 1140,290 line 940,90 940,490")

    # Chemical bonds (Benzene scaffold + pyridine heterocycle + substituents)
    # Ring 1 (Benzene)
    bonds = [
        (870, 230, 930, 195, "#38bdf8", 4),
        (930, 195, 990, 230, "#64748b", 3.5),
        (990, 230, 990, 300, "#38bdf8", 4),
        (990, 300, 930, 335, "#10b981", 4),
        (930, 335, 870, 300, "#64748b", 3.5),
        (870, 300, 870, 230, "#38bdf8", 4),
        # Ring 2 (Pyridine / pharmacophore)
        (990, 230, 1050, 195, "#10b981", 4),
        (1050, 195, 1110, 230, "#64748b", 3.5),
        (1110, 230, 1110, 300, "#38bdf8", 4),
        (1110, 300, 1050, 335, "#64748b", 3.5),
        (1050, 335, 990, 300, "#64748b", 3.5),
        # Substituents
        (870, 230, 810, 195, "#ef4444", 3.5),
        (870, 300, 825, 345, "#0ea5e9", 3.5),
        (930, 335, 930, 400, "#10b981", 3.5),
        (930, 400, 985, 435, "#64748b", 3),
        (1050, 195, 1050, 135, "#0ea5e9", 3.5),
        (1110, 230, 1160, 200, "#10b981", 3.5),
        (1110, 300, 1165, 335, "#8b5cf6", 3.5),
    ]
    for x1, y1, x2, y2, color, width in bonds:
        draw_ops.append(f"stroke '{color}' stroke-width {width} line {x1},{y1} {x2},{y2}")

    # Inner aromatic dashed circle
    draw_ops.append("stroke '#38bdf8' stroke-width 2 stroke-opacity 0.4 fill 'none' circle 930,265 930,297")

    # Hydrogen bond dashed interactions to pocket
    hbonds = [
        (1050, 135, 1050, 85),
        (1160, 200, 1160, 150),
        (930, 400, 890, 450),
    ]
    for x1, y1, x2, y2 in hbonds:
        draw_ops.append(f"stroke '#38bdf8' stroke-width 2 line {x1},{y1} {x2},{y2}")

    # Active site residue badges
    residues = [
        (1050, 80, "ASP831", "#0ea5e9", "#38bdf8"),
        (1160, 145, "MET793", "#10b981", "#34d399"),
        (885, 455, "LYS745", "#6366f1", "#818cf8"),
    ]
    for rx, ry, rlabel, rstroke, rtext in residues:
        draw_ops.append(f"stroke '{rstroke}' stroke-width 2 fill '#0f172a' circle {rx},{ry} {rx},{ry+15}")
        draw_ops.append(f"stroke 'none' fill '{rtext}' font Helvetica-Bold font-size 10 text {rx-20},{ry+4} '{rlabel}'")

    # Atom nodes
    carbon_nodes = [(870,230), (930,195), (990,230), (990,300), (930,335), (870,300), (1050,195), (1110,230), (1110,300), (1050,335)]
    for cx, cy in carbon_nodes:
        draw_ops.append(f"stroke 'none' fill '#f8fafc' circle {cx},{cy} {cx},{cy+6}")

    # Heteroatoms
    draw_ops.append("stroke 'none' fill '#ef4444' circle 810,195 810,208") # Oxygen
    draw_ops.append("stroke 'none' fill '#ffffff' font Helvetica-Bold font-size 13 text 804,200 'O'")

    draw_ops.append("stroke 'none' fill '#0284c7' circle 1050,135 1050,148") # Nitrogen
    draw_ops.append("stroke 'none' fill '#ffffff' font Helvetica-Bold font-size 13 text 1045,140 'N'")

    draw_ops.append("stroke 'none' fill '#0ea5e9' circle 1160,200 1160,213") # NH
    draw_ops.append("stroke 'none' fill '#ffffff' font Helvetica-Bold font-size 12 text 1152,204 'NH'")

    draw_ops.append("stroke 'none' fill '#10b981' circle 930,400 930,413") # Sulfur
    draw_ops.append("stroke 'none' fill '#ffffff' font Helvetica-Bold font-size 12 text 926,405 'S'")

    draw_ops.append("stroke 'none' fill '#8b5cf6' circle 1165,335 1165,347") # Chlorine
    draw_ops.append("stroke 'none' fill '#ffffff' font Helvetica-Bold font-size 11 text 1159,339 'Cl'")

    # Docking Energy Score Tag
    draw_ops.append("stroke '#10b981' stroke-width 1.5 fill '#0f172a' roundrectangle 970,440 1160,482 8,8")
    draw_ops.append("stroke 'none' fill '#10b981' circle 990,461 990,466")
    draw_ops.append("stroke 'none' fill '#34d399' font Helvetica-Bold font-size 13 text 1005,466 'dG = -9.4 kcal/mol'")

    # Execute convert
    cmd = [
        "convert",
        "-size", "1200x630",
        "xc:#070d18",
        "-draw", " ".join(draw_ops),
        output_png
    ]

    print("Running ImageMagick to build social-preview.png...")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print("Error:", result.stderr)
        return False
    print(f"Successfully generated {output_png}")
    return True

if __name__ == "__main__":
    build_social_preview()
