// widget.js — Batsu schedule widget
// Single source of truth: ./schedule.json (schedule + reminders + notes).

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

  const MAX_REMINDERS = 3; // keep the widget compact
  const MAX_NOTES = 3;

  const dayLabelEl = document.getElementById("day-label");
  const updatedLabelEl = document.getElementById("updated-label");
  const classListEl = document.getElementById("class-list");
  const reminderListEl = document.getElementById("reminder-list");
  const noteListEl = document.getElementById("note-list");
  const errorEl = document.getElementById("error-message");
  const widgetEl = document.getElementById("widget");

  let refreshTimer = null;

  // ---------- helpers ----------

  function timeToMinutes(hhmm) {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  }

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

  // Midnight-normalized Date for pure date-math (avoids time-of-day drift).
  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  // Parses "YYYY-MM-DD" as a local date (avoids UTC off-by-one issues).
  function parseDateOnly(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function formatShortDate(date) {
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function showEmpty(container, message) {
    container.innerHTML = "";
    container.appendChild(el("div", "empty-message", message));
  }

  function showError(message) {
    errorEl.textContent = message;
    errorEl.style.display = "block";
    if (widgetEl) widgetEl.style.opacity = "0.85";
  }

  function clearError() {
    errorEl.style.display = "none";
    errorEl.textContent = "";
    if (widgetEl) widgetEl.style.opacity = "1";
  }

  // ---------- classes ----------

  function buildClassItem(entry, state) {
    const item = el("div", "class-item" + (state ? ` ${state}` : ""));

    const top = el("div", "class-top");
    top.appendChild(el("span", "subject", entry.subject));

    if (state === "now" || state === "next") {
      const badge = el("span", `badge ${state}`, state === "now" ? "NOW" : "NEXT");
      top.appendChild(badge);
    }
    item.appendChild(top);

    item.appendChild(
      el("div", "time", `${formatTime(entry.start)} – ${formatTime(entry.end)}`)
    );

    if (entry.room !== null && entry.room !== undefined && entry.room !== "") {
      item.appendChild(el("div", "room", `📍 ${entry.room}`));
    }

    return item;
  }

  function renderClasses(data, now, dayName) {
    const scheduleForDay =
      data && data.schedule && Array.isArray(data.schedule[dayName])
        ? data.schedule[dayName].slice()
        : [];

    classListEl.innerHTML = "";

    if (scheduleForDay.length === 0) {
      showEmpty(classListEl, "No classes today! ✦ enjoy the day off");
      return;
    }

    scheduleForDay.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));

    const nowMinutes = currentMinutes(now);
    let activeIndex = -1;
    let nextIndex = -1;

    scheduleForDay.forEach((entry, i) => {
      const start = timeToMinutes(entry.start);
      const end = timeToMinutes(entry.end);
      if (nowMinutes >= start && nowMinutes < end) {
        activeIndex = i;
      } else if (nowMinutes < start && nextIndex === -1) {
        nextIndex = i;
      }
    });

    scheduleForDay.forEach((entry, i) => {
      let state = null;
      if (i === activeIndex) state = "now";
      else if (i === nextIndex) state = "next";
      classListEl.appendChild(buildClassItem(entry, state));
    });

    if (activeIndex === -1 && nextIndex === -1) {
      classListEl.appendChild(
        el("div", "empty-message", "No more classes today. ✦ well done!")
      );
    }
  }

  // ---------- reminders ----------

  function buildReminderItem(reminder, whenLabel, isToday) {
    const item = el("div", "reminder-item");
    item.appendChild(el("span", "reminder-text", reminder.text));
    item.appendChild(
      el("span", "reminder-when" + (isToday ? " today" : ""), whenLabel)
    );
    return item;
  }

  function renderReminders(data, today) {
    const reminders = Array.isArray(data && data.reminders) ? data.reminders : [];

    reminderListEl.innerHTML = "";

    // Keep only reminders that are today or in the future, nearest first.
    const upcoming = reminders
      .map((r) => {
        let due = null;
        try {
          due = parseDateOnly(r.date);
        } catch (e) {
          due = null;
        }
        return { ...r, due };
      })
      .filter((r) => r.due && r.due.getTime() >= today.getTime())
      .sort((a, b) => a.due - b.due)
      .slice(0, MAX_REMINDERS);

    if (upcoming.length === 0) {
      showEmpty(reminderListEl, "Nothing due soon ✦ all clear");
      return;
    }

    const oneDay = 24 * 60 * 60 * 1000;

    upcoming.forEach((r) => {
      const diffDays = Math.round((r.due.getTime() - today.getTime()) / oneDay);
      let label;
      let isToday = false;

      if (diffDays === 0) {
        label = "Today";
        isToday = true;
      } else if (diffDays === 1) {
        label = "Tomorrow";
      } else {
        label = formatShortDate(r.due);
      }

      reminderListEl.appendChild(buildReminderItem(r, label, isToday));
    });
  }

  // ---------- notes ----------

  function renderNotes(data) {
    const notes = Array.isArray(data && data.notes) ? data.notes : [];

    noteListEl.innerHTML = "";

    if (notes.length === 0) {
      showEmpty(noteListEl, "No notes yet ✦");
      return;
    }

    const shown = notes.slice(0, MAX_NOTES);
    shown.forEach((note) => {
      noteListEl.appendChild(el("div", "note-item", note));
    });

    const remaining = notes.length - shown.length;
    if (remaining > 0) {
      noteListEl.appendChild(
        el("div", "note-more", `+${remaining} more note${remaining > 1 ? "s" : ""}`)
      );
    }
  }

  // ---------- main render ----------

  function render(data) {
    clearError();

    const now = new Date();
    const today = startOfDay(now);
    const dayName = DAY_NAMES[now.getDay()];

    dayLabelEl.textContent = dayName;
    updatedLabelEl.textContent = data && data.updated ? `Updated ${data.updated}` : "";

    renderClasses(data, now, dayName);
    renderReminders(data, today);
    renderNotes(data);
  }

  // ---------- fetch + refresh ----------

  async function loadSchedule() {
    try {
      const response = await fetch("./schedule.json", { cache: "no-store" });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      render(data);
    } catch (err) {
      showError("Couldn't load your schedule ✦ try again soon");
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
