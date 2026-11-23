#!/usr/bin/env python3
"""
Zion & Omega Universe - Quick Bundle & Delivery Automation
Author: Pedro Belentani (belentani7) - 2026

Script autónomo para verificar integridad, compilar y empaquetar
la entrega de la Galaxia Omega, Planeta Zion y Protocolo Belentani.
"""

import sys
import os
import shutil
import zipfile
import subprocess
from datetime import datetime

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
DIST_DIR = os.path.join(ROOT_DIR, "dist")
DOCS_DIR = os.path.join(ROOT_DIR, "docs")
SCREENSHOTS_DIR = os.path.join(DOCS_DIR, "screenshots")
BUNDLE_NAME = f"zion_omega_delivery_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
OUTPUT_ZIP = os.path.join(ROOT_DIR, BUNDLE_NAME)

def print_header(text: str):
    print(f"\n{'=' * 60}\n  {text}\n{'=' * 60}")

def run_step(name: str, cmd: list):
    print(f"\n[+] Ejecutando: {name} ...")
    try:
        res = subprocess.run(cmd, cwd=ROOT_DIR, check=True, text=True, capture_output=True)
        print(f"[OK] {name} exitoso.")
        return res.stdout
    except subprocess.CalledProcessError as e:
        print(f"[ERROR] Fallo en {name}:\n{e.stderr or e.stdout}")
        sys.exit(1)

def verify_assets():
    print_header("VERIFICACIÓN DE REGISTRO FOTOGRÁFICO Y ACTIVOS")
    zion_svg = os.path.join(SCREENSHOTS_DIR, "01_planeta_zion.svg")
    galaxy_svg = os.path.join(SCREENSHOTS_DIR, "02_galaxia_omega.svg")
    
    if os.path.exists(zion_svg):
        print(f"  ✓ Lámina 01 presente: {os.path.basename(zion_svg)} ({os.path.getsize(zion_svg)} bytes)")
    else:
        print(f"  ✗ Falta lámina: {zion_svg}")
        sys.exit(1)

    if os.path.exists(galaxy_svg):
        print(f"  ✓ Lámina 02 presente: {os.path.basename(galaxy_svg)} ({os.path.getsize(galaxy_svg)} bytes)")
    else:
        print(f"  ✗ Falta lámina: {galaxy_svg}")
        sys.exit(1)

def package_bundle():
    print_header("EMPAQUETANDO ENTREGA RÁPIDA (BUNDLE ZIP)")
    with zipfile.ZipFile(OUTPUT_ZIP, 'w', zipfile.ZIP_DEFLATED) as zipf:
        # Añadir dist
        for folder, _, filenames in os.walk(DIST_DIR):
            for filename in filenames:
                filepath = os.path.join(folder, filename)
                arcname = os.path.relpath(filepath, ROOT_DIR)
                zipf.write(filepath, arcname)
        
        # Añadir docs y screenshots
        for folder, _, filenames in os.walk(DOCS_DIR):
            for filename in filenames:
                filepath = os.path.join(folder, filename)
                arcname = os.path.relpath(filepath, ROOT_DIR)
                zipf.write(filepath, arcname)
        
        # Añadir README y metadatos
        for file in ["README.md", "package.json", "metadata.json"]:
            p = os.path.join(ROOT_DIR, file)
            if os.path.exists(p):
                zipf.write(p, file)

    size_mb = os.path.getsize(OUTPUT_ZIP) / (1024 * 1024)
    print(f"  ✓ Archivo empaquetado: {OUTPUT_ZIP}")
    print(f"  ✓ Tamaño total: {size_mb:.2f} MB")

def main():
    print_header("ZION PROTOCOLO OMEGA - DELIVER PIPELINE")
    verify_assets()
    package_bundle()
    print_header("ENTREGA LISTA PARA DISTRIBUCIÓN")
    print(f"Zip generado: {BUNDLE_NAME}")

if __name__ == "__main__":
    main()
