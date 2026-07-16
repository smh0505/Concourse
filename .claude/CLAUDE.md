# Claude Code Project Instructions: Game Library Client

You are an expert software engineer guiding the development of the **Game Library Client**, a desktop application that aggregates games into a unified library with a console-like "Big Picture" mode.

Your goal is to help implement this project step-by-step, adhering strictly to our architectural decisions, project proposal, and developmental milestones.

---

## 1. Reference Documents
Before performing any task, always read and align with these two core documents in the workspace root:
- `proposal.md`: Contains the overall product vision, core features, and architectural design.
- `milestones.md`: Outlines the phased roadmap and implementation checklist.

---

## 2. General Principles & Workflow

### Development Flow
- **One Step at a Time**: Work incrementally. Do not try to implement multiple milestones at once. Focus on the current active milestone.
- **Code Quality**: Write clean, modular, and self-documenting code. Prefer performance-focused, lightweight solutions where applicable.
- **Milestone Tracking**: 
  - When a task or checklist item from `milestones.md` is fully completed and verified, update the corresponding `[ ]` to `[x]` in `milestones.md`.
  - Always commit your changes after completing a sub-task or milestone.

### Core Stack Decisions (Milestone 1 First Task)
*Refer to Milestone 1: "Pick stack (Electron/Tauri+React vs .NET/Avalonia)"*.
- Since we target low-level system performance, quick startup, and lightweight footprints, we lean heavily towards **Tauri (Rust) + React/TypeScript** (or Vue/Svelte) for the frontend, utilizing SQLite for local data persistence.
- Ensure system API integrations (process spawning for launching, process-exit detection, and gamepad inputs) are handled efficiently through safe Rust/C++ system bindings where needed.

---

## 3. Architecture & Implementation Guidelines

### SQLite Schema (`milestones.md` -> Milestone 1)
Design a clean, normalized database schema using SQLite:
- `games`: id, title, executable_path, platform, cover_art_url, background_art_url, description, release_date, total_playtime
- `tags`: id, name
- `game_tags`: game_id, tag_id (many-to-many relationship)
- `playtime_sessions`: id, game_id, start_time, end_time, duration_seconds

### Process Launching & Playtime Tracking (Milestone 1 & 2)
- Use system APIs (e.g., Rust's `std::process::Command` in Tauri) to spawn game executables.
- Monitor the spawned child process actively. Log session start and end times to update the `playtime_sessions` and calculate total playtime.

### Gamepad Navigation & Big Picture Mode (Milestone 3)
- Ensure keyboard/controller focus states are highly visible.
- Implement a global input listener or utilize web-gamepad APIs for the Big Picture frontend.
- Maintain a clear route/state toggle between Desktop UI and Big Picture Mode.

### Plugin Architecture (Milestone 4 & 5)
- Define a rigid, typed interface for plugins:
  ```typescript
  interface SourcePlugin {
    id: string;
    name: string;
    scan(): Promise<GameEntry[]>;
    launch(entry: GameEntry): Promise<void>;
    getInstallStatus(entry: GameEntry): Promise<boolean>;
  }
  ```
- Establish a plugin manifest format (plugin.json) and dynamically load them at runtime.

---

## 4. Let's Get Started!
1. Begin by asking the user which Tech Stack to finalize (Tauri+React vs .NET/Avalonia) to check off the very first item of Milestone 1.
2. Once the stack is chosen, proceed with bootstrapping the project structure.
