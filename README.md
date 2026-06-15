# ugc generator

a tool for batch-generating ugc video variants from a modular clip library. built to test hooks, ctas, topics, and editing styles for instagram reels/trial without needing ad spend to figure out what works.

## the problem

most ugc/reel advice says "test, test, test" but testing at scale (20-50+ variants across different hooks, topics, ctas) usually means either manually editing dozens of videos or dropping real budget on ads just to get data. this tool automates the editing side: upload a small library of modular clips once, define which variables you want to test, and generate a batch of fully-rendered variants ready to post.

## how it works

### 1. structure
every video follows a hook → problem → solution/demo → proof → cta structure (15-30s for organic, up to 60s for tutorial-style demos). each section is modular, so any piece can be swapped without rebuilding the whole video.

| section | timing | job |
|---|---|---|
| hook | 0-3s | stop the scroll |
| problem | 3-6s | name the pain point in their language |
| solution | 6-10s | introduce the product as the "discovery" |
| demo/proof | 10-20s | show it working, payoff included |
| cta | last 2-4s | one clear action |

### 2. clip library
upload raw clips and tag each one by:
- **section** (hook, problem, solution, demo, cta)
- **topic/audience** (e.g. adhd, students, busy professionals, general)
- **format style** (storytelling, talking-head, pov, ranking, reaction-camera-flip)

### 3. text overlays
hook text and cta text variants are managed as separate lists, each with a style preset (font/position/color).

### 4. recipes
in the builder, you:
- pick which clips and text overlays are eligible per section
- set speed options (1x, 1.15x, 1.3x...) and which sections they apply to
- pick editing/transition presets (hard cut, crossfade, zoom punch-in)
- set a topic/audience axis so hook, text, and cta stay coherent within a single variant
- set how many variants you want

the builder shows a live count of total possible combinations as you adjust selections.

### 5. generation
the app builds the full combination space (hook clip × hook text × topic × demo clip × cta clip × cta text × speed × edit style), samples down to your target count (spread evenly so no single hook dominates), and renders each variant with ffmpeg, normalizing everything to 1080x1920 @ 30fps.

### 6. gallery
preview, download, and label each rendered variant. once posted, come back and log view/engagement numbers per variant to start building a picture of what actually moves the needle.

## tech stack
- next.js (app router, typescript)
- tailwind css
- sqlite (better-sqlite3)
- ffmpeg

## setup
```
npm install
npm run dev
```
ffmpeg must be installed and available on your path.

## project structure
- `/library` - upload and tag clips
- `/text` - manage hook/cta text variants
- `/builder` - configure a recipe (clips, text, speed, edit style, topic axis, target count)
- `/generate` - batch render with progress
- `/gallery` - preview, download, log results

## variant naming
output files encode their combo for quick reference:

`{recipe_name}_v{n}_topic-{topic}_hook-{hookid}_cta-{ctaid}_speed-{speed}_edit-{editstyle}.mp4`

## roadmap
- ai-suggested hook text per topic/audience
- auto-captioning for demo sections
- performance tracker that ties posted results back to recipe variables (hook style, topic, cta, speed) to surface what correlates with views/engagement/conversions
