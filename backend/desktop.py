import cv2

from backend.detector import ColorDetector
from backend.tracker import BoxTracker


YELLOW = [0, 255, 255]  # BGR color space
MIN_CONTOUR_AREA = 700  # Pixels; increase to ignore larger background patches.
MASK_KERNEL_SIZE = 5
BOX_SMOOTHING = 0.35  # Lower values give steadier boxes with more movement lag.
MIN_DETECTION_FRAMES = 3
MAX_MISSED_FRAMES = 4


def main():
    detector = ColorDetector(YELLOW, MIN_CONTOUR_AREA, MASK_KERNEL_SIZE)
    tracker = BoxTracker(BOX_SMOOTHING, MIN_DETECTION_FRAMES, MAX_MISSED_FRAMES)
    cap = cv2.VideoCapture(0)

    try:
        if not cap.isOpened():
            raise RuntimeError("Could not open the webcam.")

        while True:
            ret, frame = cap.read()
            if not ret:
                raise RuntimeError("Could not read a frame from the webcam.")

            _, boxes = detector.detect(frame)
            for x, y, width, height in tracker.update(boxes):
                cv2.rectangle(
                    frame, (x, y), (x + width, y + height), (0, 255, 0), 3
                )

            cv2.imshow("frame", frame)

            if cv2.waitKey(1) & 0xFF == ord("q"):
                break
    finally:
        cap.release()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
