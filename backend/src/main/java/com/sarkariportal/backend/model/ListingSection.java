package com.sarkariportal.backend.model;

// Lets the admin explicitly control which section a job appears in, instead of
// it only being inferred from the dates.
//   AUTO     - decide from the dates (Upcoming before start date, else Latest/Closed)
//   LATEST   - force it into "Latest jobs" (applications open)
//   UPCOMING - force it into "Upcoming jobs" (notification out, not open yet)
public enum ListingSection {
    AUTO,
    LATEST,
    UPCOMING
}
