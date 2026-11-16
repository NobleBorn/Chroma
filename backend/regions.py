import cv2
import numpy as np


def group_nearby_contours(mask, contours, gap):
    """Group across short mask gaps without inflating measured bounds or area."""
    if not contours or gap == 0:
        return [[contour] for contour in contours]
    connectivity = cv2.morphologyEx(
        mask, cv2.MORPH_CLOSE, np.ones((gap + 1, gap + 1), dtype=np.uint8)
    )
    _, labels = cv2.connectedComponents(connectivity)
    groups = {}
    for contour in contours:
        x, y = contour[0, 0]
        label = int(labels[y, x])
        # Preserve a contour independently if closing at an image edge eroded it.
        key = label if label else -len(groups) - 1
        groups.setdefault(key, []).append(contour)
    return list(groups.values())
