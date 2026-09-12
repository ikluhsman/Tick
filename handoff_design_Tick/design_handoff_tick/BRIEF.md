# Time Tracking app

I'd like to build a time tracking app for tracking billable or non-billable time as a freelancer or for a small team/organization.

## SolidTime

One similar app like this is SolidTime, however the features are a bit limited for what I want it to do. I'd like the app I build to work very similarly to SolidTime, but there are some things I'd do a bit differently.

SolidTime has a few issues that make it kind of not usable for me, I feel like it could be a little better. First I'll lay out what issues I have with SolidTime so we can make sure we incorporate a better way of doing these things in our app.

We will need a new name for the app that is catchy, short, rolls off the tongue. A few suggestions from AI would help there.

SolidTime is a "modern open-source time tracking application for freelancers and agencies". here is the features list:

- Time tracking: Track your time with a modern and easy-to-use interface
- Projects: Create and manage projects and assign project members
- Tasks: Create and manage tasks and assign tasks to projects
- Clients: Create and manage clients and assign clients to projects
- Billable rates: Set billable rates for projects, project members, organization members and organizations
- Multiple organizations: Create and manage multiple organizations with one account
- Roles and permissions: Create and manage organizations
- Import: Import your time tracking data from other time tracking applications (Supported: Toggl, Clockify, Timeentry CSV)


Basically the layout of SolidTime is a sidebar on the left with the organization/current timer/menu/navigation, and on the right in the stuck header at the top is where your timer always sits, when you're on the Dashboard and Time pages.

https://github.com/solidtime-io/solidtime

Some of the solid time issues I've noticed -

- When deleting time entries from the "Time" list on the left sidebar, there is a drop-down providing the delete link, which doesn't confirm when deleting multiple time entries. No trash can, my entries are gone in a single click with no undo or way to get them back.

- When adding manual time entries, I can't type in my own date, if I wanted to backlog from last year I have to click through the months in the date picker to get to the month I want to backlog for.

- When adding a quick time entry to start the timer, recent tracking entries appear in a quick drop-down list, but none of the project tasks can be chosen or searched to add a time entry for that task.

- I like the tasks and billable rates and the dashboard charts, those are cool but kind of boring looking, a better graphing/chart engine would be my fix for that.

- Data structure doesn't seem mature - time entries should be able to tag a project, task, or client, or none of that at all.

## Clocked

https://urclocked.com - Another tracker - I'd like ours to have a similar look and feel to both clocked and SolidTime.

## Clock
Now - on to the app I want to build - its similar to SolidTime:

I want to build a self-hosted app similar to SolidTime, where upon login a user is presented with a "Time tracker" at the top of the screen with a single-line text field saying "What are you working on?" and a timer 00:00:00 next to it on the same line. The user can enter what they're working on then hit the start button to start the timer. When the timer is stopped, the entry is added to their time entries table and displayed on the "time" page which is just a list of entries that the user has created.

## Data Model

### Data model concepts

For the data model, the concept of projects, tasks, and clients/projects/tasks will be similar to solid time, so that you can record billable or non-billable time for a particular client. Each time entry will have a billable flag and a billable rate that is either inherited from the user/client/project, or set manually directly on the time entry. A default billable rate can be set for the user in user settings, the client, or a project. If there is no client or project, tasks can still be marked as billable time, but wouldn't show up in reports under a particular client or project, they would just a task that had billable time. Tasks can belong to a project, and a project can belong to a client, where the interface lets you tag a time entry with one of those things. Multiple time entries can be added for a task, so they're not the same thing really. So this is a little more open-ended than SolidTime - you don't necessarily have to associate a project with a client, it can be stand-alone. You don't necessarily have to associate a task with a project, it can be a stand-alone task that can be marked as billable or not. You can also have just a time entry associated with a client, and no project or task. However when assigning a project to a time entry the inheritance model comes along - assigning a project brings along the client for that project, and assigning a task brings along the project the task is related to and the client that project is for.

Also cascading deletion - if user is deleting a client a confirmation modal with checkboxes of what they want to cascade delete "You're deleting ClientX, would you like to delete associated entries as well? [ ] Projects [ ] Tasks [ ] Time Entries" If they do not select like a project, lets say, the client will be cleared from that project/tasks/entries (warn the user of this as well). Look for logic flaws in this design and let me know if there are any gaps there, the relationships in data should be easy to handle in this regard.

The concept of the "Project Mode" in SolidTime - Instead of a "mode" to switch between I'd like to make this seamless, you work in simple mode until you add or tag something for the time entry like a client or project. Inside the "what are you working on" box there would be a + button with a drop-down asking to add a client, project, or task to be associated with the time entry. After picking client, project, or task from dropdown, use a modal to search for one of those items to add to the timer entry.

The idea of the clients, projects, and tasks is to track billable or non-billable time for a client when working as a freelancer. You should be able to use the app in just a simple way without having to add clients/projects/tasks, or add clients/projects/tasks switches the timer entry to project mode without having to select "change to project mode" or "change to simple mode" option like in SolidTime.

If this entire data model is flawed, lets straighten our thoughts out and sort it so we have a 'simple mode' or 'advanced mode' kind of like SolidTime, or suggest something better.

### Anticipated Database Tables and Form Fields

Clients - simple, just a name field for the client.

Projects -
    - Project Name
    - Client (dropdown picker + search)
    - Billable default (when an entry is associated with the project is the default for billable flag on or off)
    - Billable Rate - if not set here, inherit from client if client has fixed rate, otherwise use default user rate rom user settings.
    - Time estimated - language like 2h 30m or 40h
    - Visibility - Private/Public can other users see this project in the organization

Tasks -
    - Task Name
    - Project dropdown picker + search
    - Time Estimated (2h 30m)
    - Task Completed (status)

Tags - 
    - Tag Name

Time Entries -
    - Name - What did you work on? (just a basic entry name)
    - Project - dropdown picker w/search
    - Task - Dropdown filtering tasks for the selected project or picker w/search for all open tasks
    - Tags - add tags for easy open-ended filtering

## Tech Stack

Nuxt.js - frontend
Nuxt UI - forms, components, fonts, palettes, content, etc.
TailwindCSS - customized look & feel using TailwindCSS & its color palettes.
Pinia - State management
PostgreSQL - database
Docker - image available on GHCR
Nuxt.js Content Module - documentation website
Greensock - Animations, transitions, charts
D3.js (or Chart.js) for charts/reports/dashboard
Proton Mail for SMTP / application e-mail (or SMTP basic provider setup via .env config)

## Where the app can run
Installing should be done via native OS (PM2 w/Node.js sort of deployment, or even something like netlify) or by way of dockerfile or docker compose file. A .env.example file will be needed for binding the ip/port, setting up keys and authentication, or any other secrets or configuration that needs to be stored. GHCR is fine for the docker image, and I'll setup a repository on GitHub for the app and its documentation, the documentation site will probably live in the same repo and just get deployed alongside the the main app in netlify on my free tier org. I'll self-host an instance of the app for myself to use, and we should maybe also setup a netlify demo that we can link from the documentation that resets its own data every so often for the sake of bad acting.

The application should be a PWA-style web application installable on mobile devices, and all views/pages/routes should be designed mobile-first in mind, so time can be easily entered without interfering with your daily workflows and you can focus on your tasks.

The desktop experience would just be a simple layout with a navbar/menu in a side-bar on the left of the screen, the timer at the top of the screen positioned inset to the right of the side-bar (side-bar pushes timer over to right) and below the timer stuck to the top of the screen is the page/route content.

The menu should have a dashboard, time entries page, calendar, and reports. There would be a section to manage projects and their tasks, enter clients, and manage tags and the organization settings in general.

Dashboard will have cards - time entries today, and an activity graph similar to the github commit chart in the github user profile where you have dots for each day for the past couple months, say, mtwrf down the left side and each week is a column, the dot fades into solid as more time entries were recorded that day. Also have a weekly horizontal bar graph, and total time statisics across the top. A donut chart showing time spent on billable projects as well.

### Look and feel

Style with tailwindcss, want to design a color picker component similar to the one on the Nuxt UI documentation site that allows you to choose the Primary / neutral / font / icons / radius / light-dark, I would LOVE to have the theme editor in there as well with some of the pre-built themes they were using in the Nuxt UI site theme builder.

Nuxt UI components should be used unless there is simply a better option. NuxtUI should have some chart options lets see if we can get away with those and use D3 or charts.js if we need some custom charts. Greensock to animate charts, page transitions, element motion, SVG drawing where possible and artistically necessary, etc.

The primary theme should have some stars kind of like the Nuxt UI home page on the left pane, only more of a space-starry look.

Use the Nuxt UI calendars, avatars, badges, login widgets, buttons, breadcrumbs, search modals.

## Building the app with AI agents

When we build out the app we'll probably want orchestration of some AI agents to build out different parts of the app. Fable can orchestrate where Opus might architect the various different agentic processes that we'll use to build the different parts of the app. Sonnet can go ahead and do the routine builds and code checks, testing, etc, while Opus supervises and provides architectural and input. Use some sonnet agents to QA the builds that the other workers are doing, and fix bugs while they're working and checking the UX to ensure the mobile and desktop experience stay usable and function the same.

## Claude designer notes

The designer should assume the role of a web app designer freelancer that is building a self-hosted app for their own benefit like I'm doing. We'd love others to benefit as well and the app is free under MIT I think for anyone else to expand on and use. Design the UI with a sparkling bullet-proof UI/UX and desktop experience as well to match. We'll need some handoff documents for the Claude code agents to take on the code backend and front-end code.

I like the look of the Nuxt UI and its components and designing the app based around their concepts, with our own custom animations, transitions, backgrounds, themes, and flexible look and feel for the site.

## Functionality of the app itself

The app needs to be super functional, user-friendly, and have meaningful reporting that displays time entries, projects, tasks, etc in a super-organized fashion. the dashboard should be fairly customizable but not overly-so, like we can add or hide some charts that we decide to include on the dashboard, but the app itself isnt exactly geared toward the dashboard thing, its more about the list of time entries and making that part really useful that will separate it from something like Solidtime.

## Where I'll build my code

WSL, git hub repository cloned to WSL with a remote pointing to the github repo.

## Conclusion

Lets build it! Let me know about any logic issues or questions/decisions that need to be made along the way, this is going to be intended for a private small team of workers to track their time on projects and the tasks for those projects, or just for an individual to track some time for simple tasks in the end and bill it to a customer. That's not to say that it shouldn't handle a lot of tasks, we'll need pagination/searches in modals and things for larger lists.

---

## Decisions made during design (appended)

- **Name:** Tick. Logo: a tick whose body is a clock dial and whose front legs are the hour/minute hands.
- **Data model:** entries store only the deepest reference (task | project | client | none); project and client are derived at read time. Cascade-delete checkboxes cascade downward (Projects ⇒ Tasks ⇒ Entries).
- **Deleting entries:** single delete → undo toast; bulk → confirm dialog; everything soft-deletes to a 30-day trash.
- **Dates:** manual entries accept typed dates in any common format, parsed live.
- **Theme editor:** Nuxt UI theme-picker pattern (primary / neutral / radius / font / light-dark / sidebar starfield) with presets; build with Nuxt UI components.
