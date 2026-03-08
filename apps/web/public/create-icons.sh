#!/bin/bash
# Create PNG icons from SVG for PWA

# Check if ImageMagick is available
if command -v convert &> /dev/null; then
  echo "Using ImageMagick convert..."
  convert -background none icon.svg -resize 192x192 icon-192.png
  convert -background none icon.svg -resize 512x512 icon-512.png
  echo "✓ Icons created: icon-192.png, icon-512.png"
elif command -v magick &> /dev/null; then
  echo "Using ImageMagick magick..."
  magick convert -background none icon.svg -resize 192x192 icon-192.png
  magick convert -background none icon.svg -resize 512x512 icon-512.png
  echo "✓ Icons created: icon-192.png, icon-512.png"
else
  echo "⚠ ImageMagick not found. Creating placeholder PNGs..."
  # Create minimal valid 1x1 PNG files as placeholders
  # These are base64 encoded 1x1 transparent PNGs
  echo "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" | base64 -d > icon-192.png
  echo "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" | base64 -d > icon-512.png
  echo "✓ Placeholder PNGs created. Replace with actual 192x192 and 512x512 icons."
fi
