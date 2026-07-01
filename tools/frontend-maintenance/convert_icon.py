from PIL import Image
import sys

def convert_to_png(input_path, output_path):
    try:
        with Image.open(input_path) as img:
            # Ensure it's RGB even if it was CMYK or something else
            img = img.convert("RGBA")
            img.save(output_path, "PNG")
        print(f"Successfully converted {input_path} to {output_path}")
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    convert_to_png(sys.argv[1], sys.argv[2])
