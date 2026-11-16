# 🎨 Color Detection & Object Tracking

An interactive computer vision application built with **Python and OpenCV**, designed to explore the fundamentals of image processing, color detection, and object tracking.

This project started as an introduction to **Computer Vision**, with the goal of understanding how computers can identify and track objects based on their colors. It has since evolved into an interactive web application where users can experiment with real-time color detection using their own webcams.

## 🚀 Features

- **Real-Time Color Detection** – Detect objects based on predefined or custom color ranges.
- **Object Tracking** – Track detected objects across consecutive video frames.
- **Interactive Color Controls** – Adjust HSV (Hue, Saturation, Value) thresholds to experiment with different colors.
- **Live Webcam Integration** – Use your webcam directly from the browser.
- **Bounding Box Visualization** – Highlight detected objects with dynamically updated bounding boxes.
- **Customizable Detection Settings** – Experiment with detection parameters and observe their impact in real time.

## 🧠 How It Works

The application uses traditional computer vision techniques to detect and track colored objects.

1. **Frame Capture:** Capture video frames from the user's webcam.
2. **Color Space Conversion:** Convert frames from BGR/RGB to HSV for easier color segmentation.
3. **Color Thresholding:** Apply HSV ranges to create a binary mask identifying pixels that match the selected color.
4. **Contour Detection:** Identify connected regions in the mask and filter out small detections.
5. **Bounding Boxes:** Calculate bounding boxes around detected objects.
6. **Object Tracking:** Associate detections across consecutive frames to maintain object identities.
7. **Visualization:** Display the results through an interactive interface.

The project demonstrates how relatively simple image processing techniques can be combined to build a real-time object detection system without relying on deep learning models.

## 🛠️ Technologies

- **Python** – Core detection and tracking logic
- **OpenCV** – Image processing and computer vision
- **FastAPI** – Backend API and WebSocket communication
- **Next.js & React** – Interactive frontend
- **TypeScript** – Frontend development
- **Tailwind CSS** – User interface styling
- **WebSockets** – Real-time communication between the browser and Python backend

## 📚 What I Learned

This project allowed me to explore several fundamental computer vision concepts:

- Understanding different color spaces, particularly RGB, BGR, and HSV.
- Using image segmentation to isolate objects based on color.
- Applying contour detection and bounding boxes to identify objects.
- Implementing basic object tracking across video frames.
- Working with real-time video processing and performance considerations.
- Integrating Python computer vision functionality into an interactive web application.