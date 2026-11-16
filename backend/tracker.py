from dataclasses import dataclass


def intersection_over_union(first, second):
    x, y, width, height = first
    other_x, other_y, other_width, other_height = second
    overlap_width = max(0, min(x + width, other_x + other_width) - max(x, other_x))
    overlap_height = max(0, min(y + height, other_y + other_height) - max(y, other_y))
    intersection = overlap_width * overlap_height
    union = width * height + other_width * other_height - intersection
    return intersection / union if union else 0


def overlap_fraction(first, second):
    """Fraction of the smaller box covered by the larger one."""
    x, y, width, height = first
    other_x, other_y, other_width, other_height = second
    intersection = max(0, min(x + width, other_x + other_width) - max(x, other_x)) * max(
        0, min(y + height, other_y + other_height) - max(y, other_y)
    )
    area = min(width * height, other_width * other_height)
    return intersection / area if area else 0


def centered_scale_change(first, second):
    x, y, width, height = first
    other_x, other_y, other_width, other_height = second
    return (
        overlap_fraction(first, second) >= 0.8
        and abs(x + width / 2 - other_x - other_width / 2) <= min(width, other_width) / 2
        and abs(y + height / 2 - other_y - other_height / 2) <= min(height, other_height) / 2
    )


@dataclass
class _Track:
    box: tuple
    last_detection: tuple
    hits: int = 1
    missed: int = 0
    confirmed: bool = False
    track_id: int = 0


class BoxTracker:
    """Match overlapping boxes, confirm persistent objects, and smooth movement."""

    def __init__(self, smoothing=0.35, min_hits=3, max_missed=4, min_iou=0.2,
                 handle_scale_changes=False):
        if not 0 < smoothing <= 1 or not 0 < min_iou <= 1:
            raise ValueError("smoothing and min_iou must be between 0 and 1.")
        if min_hits < 1 or max_missed < 0:
            raise ValueError("min_hits must be positive and max_missed nonnegative.")
        self.smoothing = smoothing
        self.min_hits = min_hits
        self.max_missed = max_missed
        self.min_iou = min_iou
        self.handle_scale_changes = handle_scale_changes
        self._tracks = []
        self._next_id = 1

    def update(self, boxes):
        """Return stable boxes for one frame; call even when no objects appear."""
        boxes = list(boxes)
        candidates = []
        for track_index, track in enumerate(self._tracks):
            for box_index, box in enumerate(boxes):
                score = intersection_over_union(track.last_detection, box)
                if (score < self.min_iou and self.handle_scale_changes
                        and centered_scale_change(track.last_detection, box)):
                    score = self.min_iou
                if score >= self.min_iou:
                    candidates.append((score, track_index, box_index))

        matched_tracks, matched_boxes = set(), set()
        for _, track_index, box_index in sorted(candidates, reverse=True):
            if track_index in matched_tracks or box_index in matched_boxes:
                continue
            track = self._tracks[track_index]
            box = boxes[box_index]
            track.box = tuple(
                old + self.smoothing * (new - old)
                for old, new in zip(track.box, box)
            )
            track.last_detection = box
            track.hits += 1
            track.missed = 0
            track.confirmed = track.confirmed or track.hits >= self.min_hits
            matched_tracks.add(track_index)
            matched_boxes.add(box_index)

        surviving_tracks = []
        for index, track in enumerate(self._tracks):
            if index not in matched_tracks:
                track.missed += 1
                track.hits = 0
                # A currently detected region supersedes a substantially
                # overlapping missed track; do not display both as two objects.
                if self.handle_scale_changes and any(
                    overlap_fraction(track.last_detection, box) >= 0.8 for box in boxes
                ):
                    continue
            # Unconfirmed detections must appear in consecutive frames.
            if track.missed <= self.max_missed and (track.confirmed or not track.missed):
                surviving_tracks.append(track)

        for index, box in enumerate(boxes):
            if index not in matched_boxes:
                surviving_tracks.append(
                    _Track(tuple(box), tuple(box), confirmed=self.min_hits == 1,
                           track_id=self._next_id)
                )
                self._next_id += 1
        self._tracks = surviving_tracks
        return [
            tuple(round(value) for value in track.box)
            for track in self._tracks
            if track.confirmed
        ]

    def update_with_ids(self, boxes):
        """Web API variant; preserve update()'s desktop return format."""
        self.update(boxes)
        return [
            (track.track_id, tuple(round(value) for value in track.box))
            for track in self._tracks if track.confirmed
        ]
