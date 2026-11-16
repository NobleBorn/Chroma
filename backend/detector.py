import cv2
import numpy as np

from backend.util import get_limits
from backend.regions import group_nearby_contours


class ColorDetector:
    """Threshold a BGR color and find sufficiently large regions."""

    def __init__(self, color, min_area=700, kernel_size=5, fragment_gap=0):
        if min_area <= 0:
            raise ValueError("min_area must be positive.")
        if kernel_size < 1 or kernel_size % 2 == 0:
            raise ValueError("kernel_size must be a positive odd integer.")
        if not isinstance(fragment_gap, int) or fragment_gap < 0:
            raise ValueError("fragment_gap must be a nonnegative integer.")
        self.lower_limit, self.upper_limit = get_limits(color)
        self.min_area = min_area
        self.fragment_gap = fragment_gap
        self.kernel = np.ones((kernel_size, kernel_size), dtype=np.uint8)

    def create_mask(self, frame):
        """Remove isolated pixels, then fill small gaps in matching regions."""
        hsv_image = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        if self.lower_limit[0] > self.upper_limit[0]:
            # A wrapped hue interval includes red on both sides of hue zero.
            first_upper = self.upper_limit.copy()
            first_upper[0] = 179
            second_lower = self.lower_limit.copy()
            second_lower[0] = 0
            mask = cv2.bitwise_or(
                cv2.inRange(hsv_image, self.lower_limit, first_upper),
                cv2.inRange(hsv_image, second_lower, self.upper_limit),
            )
        else:
            mask = cv2.inRange(hsv_image, self.lower_limit, self.upper_limit)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, self.kernel)
        return cv2.morphologyEx(mask, cv2.MORPH_CLOSE, self.kernel)

    def set_hsv_limits(self, lower, upper):
        """Set explicit HSV limits; lower hue > upper hue wraps through red."""
        self.lower_limit = np.array(lower, dtype=np.uint8)
        self.upper_limit = np.array(upper, dtype=np.uint8)

    def find_boxes(self, mask):
        """Group nearby fragments, then return boxes passing the area filter."""
        contours, _ = cv2.findContours(
            mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )
        return [
            cv2.boundingRect(np.concatenate(group))
            for group in group_nearby_contours(mask, contours, self.fragment_gap)
            if sum(cv2.contourArea(contour) for contour in group) >= self.min_area
        ]

    def detect(self, frame):
        """Return the cleaned mask and boxes passing the area threshold.

        The preview retains small regions so threshold tuning is visible.
        """
        mask = self.create_mask(frame)
        return mask, self.find_boxes(mask)
