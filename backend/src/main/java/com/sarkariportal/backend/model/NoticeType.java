package com.sarkariportal.backend.model;

// An admit card / result / answer key is posted SEPARATELY from the job, because
// when a job notification first goes out nobody knows when these will be released.
// The admin posts one of these later, whenever the recruiting body publishes it.
public enum NoticeType {
    ADMIT_CARD,
    RESULT,
    ANSWER_KEY
}
