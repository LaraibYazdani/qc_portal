"""
PackVision's print-check engine (from the print-qc-vision proof of concept).

  reference.py  design file → clean reference (dielines removed, panels, inks)
  align.py      photo → reference grid (SIFT + MAGSAC, repeated panels, ECC)
  compare.py    defects, ink colours, coverage → PASS / FAIL / RETAKE
  check.py      one photo end to end
  worker.py     entry points for the worker processes

Heavy (OpenCV, NumPy, scikit-image): imported only inside worker processes,
never by the web process.
"""
