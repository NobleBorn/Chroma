import unittest

import numpy as np

from backend.detector import ColorDetector
from backend.tracker import BoxTracker


class RegionTests(unittest.TestCase):
    def setUp(self):
        self.detector = ColorDetector([0, 255, 255], fragment_gap=6)

    def test_split_object_is_one_region_without_inflated_bounds(self):
        mask = np.zeros((200, 300), dtype=np.uint8)
        mask[50:130, 50:130] = 255
        mask[50:130, 87:93] = 0
        self.assertEqual(self.detector.find_boxes(mask), [(50, 50, 80, 80)])
        self.assertEqual(len(ColorDetector([0, 255, 255]).find_boxes(mask)), 2)

    def test_distinct_objects_remain_separate(self):
        mask = np.zeros((200, 300), dtype=np.uint8)
        mask[50:100, 40:90] = 255
        mask[50:100, 110:160] = 255
        self.assertEqual(sorted(self.detector.find_boxes(mask)),
                         [(40, 50, 50, 50), (110, 50, 50, 50)])

    def test_combined_color_area_qualifies_but_gap_pixels_do_not_count(self):
        mask = np.zeros((200, 300), dtype=np.uint8)
        mask[50:75, 40:60] = 255
        mask[50:75, 65:85] = 255
        self.assertEqual(self.detector.find_boxes(mask), [(40, 50, 45, 25)])
        self.detector.min_area = 1000  # Original contour areas total 912, box is 1125.
        self.assertEqual(self.detector.find_boxes(mask), [])

    def test_shrinking_object_keeps_one_tracking_id(self):
        tracker = BoxTracker(min_hits=2, handle_scale_changes=True)
        large = (40, 40, 100, 100)
        small = (75, 75, 30, 30)
        tracker.update_with_ids([large])
        original = tracker.update_with_ids([large])[0][0]
        for _ in range(5):
            result = tracker.update_with_ids([small])
            self.assertEqual(len(result), 1)
            self.assertEqual(result[0][0], original)

    def test_superseded_missed_box_does_not_duplicate_new_detection(self):
        tracker = BoxTracker(min_hits=2, handle_scale_changes=True)
        tracker.update_with_ids([(0, 0, 100, 100)])
        tracker.update_with_ids([(0, 0, 100, 100)])
        off_center = (80, 40, 15, 15)
        self.assertEqual(tracker.update_with_ids([off_center]), [])
        self.assertEqual(len(tracker.update_with_ids([off_center])), 1)

    def test_scaling_does_not_join_separate_tracks(self):
        tracker = BoxTracker(min_hits=1, handle_scale_changes=True)
        initial = tracker.update_with_ids([(20, 20, 100, 100), (200, 20, 80, 80)])
        updated = tracker.update_with_ids([(55, 55, 30, 30), (200, 20, 80, 80)])
        self.assertEqual([item[0] for item in updated], [item[0] for item in initial])


if __name__ == '__main__':
    unittest.main()
