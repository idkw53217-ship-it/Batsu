// widget.js — Batsu schedule widget
// Fetches ./schedule.json (single source of truth) and renders today's classes.

(function () {
  "use strict";

  const DAY_NAMES = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  const dayLabelEl = document.getElementById("day-label");
  const updatedLabelEl = document.getElementById("updated-label");
  const classListEl = document.getElementById("class-list");
  const statusEl = document.getElementById("status-message");
  const errorEl = document.getElementById("error-message");

  let refreshTimer = null;

  /**
   * Converts "HH:MM" (24-hour) into total minutes since midnight.
   */
  function timeToMinutes(hhmm) {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  }

  /**
   * Converts "HH:MM" (24-hour) into "H:MM AM/PM".
   */
  function formatTime(hhmm) {
    const [h, m] = hhmm.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    let hour12 = h % 12;
    if (hour12 === 0) hour12 = 12;
    const minutes = String(m).padStart(2, "0");
    return `${hour12}:${minutes} ${period}`;
  }

  function currentMinutes(now) {
    return now.getHours() * 60 + now.getMinutes();
  }

  function showError(message) {
    errorEl.textContent = message;
    errorEl.style.display = "block";
    statusEl.style.display = "none";
    classListEl.innerHTML = "";
  }

  function clearError() {
    errorEl.style.display = "none";
    errorEl.textContent = "";
  }

  function showStatusMessage(message) {
    statusEl.textContent = message;
    statusEl.style.display = "block";
  }

  function hideStatusMessage() {
    statusEl.style.display = "none";
    statusEl.textContent = "";
  }

  function buildClassItem(entry, state) {
    const item = document.createElement("div");
    item.className = "class-item" + (state ? ` ${state}` : "");

    const top = document.createElement("div");
    top.className = "class-top";

    const subject = document.createElement("span");
    subject.className = "subject";
    subject.textContent = entry.subject;
    top.appendChild(subject);

    if (state === "now" || state === "next") {
      const badge = document.createElement("span");
      badge.className = `badge ${state}`;
      badge.textContent = state === "now" ? "NOW" : "NEXT";
      top.appendChild(badge);
    }

    item.appendChild(top);

    const time = document.createElement("div");
    time.className = "time";
    time.textContent = `${formatTime(entry.start)} – ${formatTime(entry.end)}`;
    item.appendChild(time);

    if (entry.room !== null && entry.room !== undefined && entry.room !== "") {
      const room = document.createElement("div");
      room.className = "room";
      room.textContent = `Room: ${entry.room}`;
      item.appendChild(room);
    }

    return item;
  }

  function render(data) {
    clearError();

    const now = new Date();
    const dayName = DAY_NAMES[now.getDay()];
    dayLabelEl.textContent = dayName;

    if (data && data.updated) {
      updatedLabelEl.textContent = `Updated ${data.updated}`;
    } else {
      updatedLabelEl.textContent = "";
    }

    const scheduleForDay =
      (data && data.schedule && Array.isArray(data.schedule[dayName]))
        ? data.schedule[dayName].slice()
        : [];

    classListEl.innerHTML = "";

    if (scheduleForDay.length === 0) {
      showStatusMessage("No classes today!");
      return;
    }

    // Sort by start time.
    scheduleForDay.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));

    const nowMinutes = currentMinutes(now);

    // Determine the currently active class (if any) and the next upcoming one.
    let activeIndex = -1;
    let nextIndex = -1;

    for (let i = 0; i < scheduleForDay.length; i++) {
      const entry = scheduleForDay[i];
      const start = timeToMinutes(entry.start);
      const end = timeToMinutes(entry.end);

      if (nowMinutes >= start && nowMinutes < end) {
        activeIndex = i;
      } else if (nowMinutes < start && nextIndex === -1) {
        nextIndex = i;
      }
    }

    let hasVisibleContent = false;

    scheduleForDay.forEach((entry, i) => {
      let state = null;
      if (i === activeIndex) {
        state = "now";
      } else if (i === nextIndex) {
        state = "next";
      }
      classListEl.appendChild(buildClassItem(entry, state));
      hasVisibleContent = true;
    });

    if (hasVisibleContent) {
      hideStatusMessage();
    }

    // If there's no active class and no next class, all classes for today are done.
    if (activeIndex === -1 && nextIndex === -1) {
      showStatusMessage("No more classes today.");
    }
  }

  async function loadSchedule() {
    try {
      const response = await fetch("./schedule.json", { cache: "no-store" });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      render(data);
    } catch (err) {
      showError("Couldn't load schedule.json. Check your connection or the file.");
      console.error("Batsu widget: failed to load schedule.json", err);
    }
  }

  function scheduleAutoRefresh() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
    }
    refreshTimer = setInterval(loadSchedule, 60 * 1000); // every minute
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadSchedule();
    scheduleAutoRefresh();
  });
})();
