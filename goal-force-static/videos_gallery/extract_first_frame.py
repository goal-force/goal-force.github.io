import cv2
import argparse
import sys
from pathlib import Path

def extract_frames(directory):
    """
    Reads the first frame of 'seed_0.mp4' in the given directory,
    saves it as 'frame_0.png', and saves a center square crop
    as 'icon.png'.
    """
    
    # --- 1. Define Paths ---
    # Use pathlib for easy and robust path manipulation
    in_dir = Path(directory)
    video_path = in_dir / "seed_0.mp4"
    frame_path = in_dir / "frame_0.png"
    icon_path = in_dir / "icon.png"

    # --- 2. Check if video file exists ---
    if not video_path.exists():
        print(f"Error: Video file not found at {video_path}", file=sys.stderr)
        sys.exit(1)

    # --- 3. Read the first frame ---
    # Open the video file
    cap = cv2.VideoCapture(str(video_path))
    
    if not cap.isOpened():
        print(f"Error: Could not open video file {video_path}", file=sys.stderr)
        sys.exit(1)

    # Read the first frame
    ret, frame = cap.read()
    
    # Release the video capture object immediately
    cap.release()

    if not ret:
        print(f"Error: Could not read the first frame from {video_path}", file=sys.stderr)
        sys.exit(1)

    # --- 4. Save the full first frame ---
    # cv2.imwrite expects string paths
    try:
        cv2.imwrite(str(frame_path), frame)
        print(f"Successfully saved first frame to: {frame_path}")
    except Exception as e:
        print(f"Error saving frame: {e}", file=sys.stderr)
        sys.exit(1)

    # --- 5. Create and save the center square crop ---
    h, w = frame.shape[:2]  # Get height and width
    
    # Find the smallest dimension
    min_dim = min(h, w)
    
    # Calculate coordinates for the center crop
    start_x = (w - min_dim) // 2
    end_x = start_x + min_dim
    
    start_y = (h - min_dim) // 2
    end_y = start_y + min_dim

    # Perform the crop using NumPy slicing
    center_crop = frame[start_y:end_y, start_x:end_x]

    # Save the cropped icon
    try:
        cv2.imwrite(str(icon_path), center_crop)
        print(f"Successfully saved icon to: {icon_path}")
    except Exception as e:
        print(f"Error saving icon: {e}", file=sys.stderr)
        sys.exit(1)

def main():
    # --- 6. Set up command-line argument parser ---
    parser = argparse.ArgumentParser(
        description="Extract the first frame of 'seed_0.mp4' and a center crop."
    )
    parser.add_argument(
        "directory", 
        type=str, 
        help="The directory containing the 'seed_0.mp4' file."
    )
    
    args = parser.parse_args()
    
    extract_frames(args.directory)

if __name__ == "__main__":
    main()