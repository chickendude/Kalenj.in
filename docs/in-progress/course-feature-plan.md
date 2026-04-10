# Course Content Data Plan

Status: Draft

## Purpose

Define the content data model needed to feed the app for a course built around lemmatized short stories, staged vocabulary introduction, and CEFR-aligned English coverage tracking.

This doc is intended to be the reference point for the data structures, relationships, and editorial workflow needed to populate the app.

## Current App Context

The app already has the beginnings of the content graph we need:

- `Word`: dictionary-style lemma entries with translations, notes, and part of speech.
- `ExampleSentence`: example sentences linked back to words through token mappings.
- `Story` and `StorySentence`: story storage already exists, but story-to-lemma coverage and lesson sequencing do not.
- Corpus tokenization/linking already supports a manual lemmatization workflow.

The new feature should extend these foundations instead of creating a second parallel vocabulary system.

## Product Goals

- Organize the course into CEFR sections: `A1`, `A2`, `B1`, `B2`, `C1`.
- Build lessons from small, repeatable vocabulary chunks.
- Track which lemmas have been introduced to learners and which are still new.
- Support story ingestion first, then use the lemmatized output to plan vocabulary introduction.
- Track English CEFR target words separately from Kalenjin lemmas.
- Allow one Kalenjin lemma to cover one or more CEFR English target words.
- Allow higher-level CEFR English targets to be marked as covered even if the course is currently in an earlier section.

## Core Terminology

- `Lemma`: the dictionary form of a Kalenjin word or phrase, stored in `Word`.
- `Introduced`: a lemma that has appeared in a published lesson part as a target learning item.
- `Discovered`: a lemma found in a lemmatized story/corpus item, but not yet introduced in the course.
- `Target word`: a lesson item built around a lemma.
- `CEFR English target`: an English word or meaning tagged with a CEFR level such as `A1: hello` or `B1: understand`.
- `Coverage`: the relationship showing that a Kalenjin lemma helps teach one or more CEFR English targets.

## Content Structure

The course should follow this hierarchy:

`Section -> Lesson -> Lesson Part -> Target Words`

### Sections

There are five fixed sections:

- `A1`
- `A2`
- `B1`
- `B2`
- `C1`

### Lessons

- A lesson belongs to one section.
- A lesson has an explicit order within the section.
- A lesson may start with an optional grammar note block.
- A lesson contains `2` or `3` ordered parts.
- Lessons should remain small enough that a story can eventually reinforce recently introduced vocabulary.

### Lesson Grammar Block

- A lesson can optionally begin with a grammar lesson.
- This is a single Markdown string intended for grammar notes.
- It appears before the lesson parts.
- It does not count as one of the `2` or `3` lesson parts.

### Lesson Parts

- A lesson part contains `5` or `6` target words.
- A lesson part is the main unit where a learner meets new vocabulary.
- A lesson part should store editorial notes and a publish state.

### Target Words

Each target word in a lesson part should reference a `Word` lemma and include:

- Lemma / dictionary form.
- One or more definitions or glosses.
- An example sentence in Kalenjin.
- A natural sentence translation.
- A word-for-word translation.
- Notes with Markdown support.
- The display order within the part.

The lesson item should preserve both:

- the normalized dictionary meaning from the linked `Word`
- the more idiomatic word-for-word explanation used for teaching the sentence

This matters because the learner-facing explanation may need to be more contextual than the bare dictionary gloss.

### Story Lessons

Stories should be part of the ordered lesson sequence.

The intended learner flow is:

- several standard vocabulary and grammar lessons
- then a story lesson

This means stories may be planned first for editorial reasons, but in the app they should still appear as regular lessons in the learning path.

## CEFR English Coverage Model

The CEFR list is a separate planning axis from lesson order.

We need a master list of English CEFR targets with:

- CEFR level (`A1`, `A2`, `B1`, `B2`, `C1`)
- English reference entry, which may be a single word or a multi-word phrase
- optional notes or disambiguation

These CEFR targets are primarily for course-reference coverage rather than strict English dictionary modeling, so entries like `hello`, `good morning`, or `to search` should all be valid.

Each English reference entry should appear only once in the CEFR list. We do not need a separate sense model for different meanings of the same English form.

Then we need a many-to-many mapping between `Word` and CEFR English targets because:

- one Kalenjin lemma may cover multiple English targets
- one English target may be covered by multiple Kalenjin lemmas over time
- a lemma taught in an `A1` lesson may legitimately cover a `B1` English target

Coverage should be tracked independently from the current course section. In other words, course pacing and CEFR English coverage are related, but not identical.

The CEFR English list is a guideline to help ensure broad vocabulary coverage. It should not limit lesson creation, and Kalenjin lesson vocabulary does not need to map perfectly onto the English reference list.

## Editorial Workflow

The main workflow should look like this:

1. Add a new story or corpus text.
2. Tokenize and lemmatize it.
3. Link tokens to existing `Word` entries or create missing lemmas.
4. Compare the story's lemmas against the set of already taught lemmas.
5. Produce a queue of discovered-but-untaught lemmas.
6. Create or assign example sentences for those lemmas.
7. Assemble lesson parts from those candidate lemmas.
8. Publish the vocabulary lesson that teaches those lemmas.
9. Recompute story coverage to decide when that story is teachable.

This gives us a content pipeline where stories drive vocabulary discovery, and lessons progressively make those stories accessible.

## Required States And Tracking

At minimum, the system should distinguish these states:

- `in_dictionary`: lemma exists in `Word`
- `discovered`: lemma appears in a story/corpus item
- `sentence_ready`: editorial sentence content exists for the lemma
- `scheduled`: lemma has been assigned to a lesson part
- `taught`: lemma has been included in a published vocabulary lesson

Important rule:

A lemma should not count as taught merely because it exists in the dictionary or appears in a story. It only becomes taught when it is included in a published vocabulary lesson.

## Suggested Data Model

This is the recommended direction for the first schema pass.

### Reuse Existing Models

- Keep `Word` as the canonical Kalenjin lemma entry.
- Keep `ExampleSentence` as the canonical corpus sentence record, including lesson sample sentences.
- Keep `Story` and `StorySentence` as the source text models.
- Expand corpus models if needed so lesson sample sentences can stay in the corpus while lesson-specific teaching metadata remains flexible.

### Add Course Structure Models

- `CourseSection`
  - fixed key: `A1 | A2 | B1 | B2 | C1`
  - title
  - order

- `CourseLesson`
  - id
  - sectionId
  - title
  - order
  - type: `vocabulary | story`
  - vocabularyType: `grammar | vocab | expression` (nullable)
  - grammarMarkdown
  - notes
  - status: `draft | published`
  - storyId (nullable)

- `CourseLessonPart`
  - id
  - lessonId
  - title
  - order
  - notes
  - status: `draft | published`

- `LessonPartWord`
  - id
  - lessonPartId
  - wordId
  - order
  - sentenceId
  - sentenceTranslation
  - wordForWordTranslation
  - notesMarkdown
  - taughtAt

`LessonPartWord` should reference a shared `ExampleSentence` record in the corpus. It should still store lesson-specific teaching fields such as sentence translation, word-for-word translation, and notes, because the pedagogical framing may differ from the canonical sentence record.

`CourseLesson.grammarMarkdown` should be nullable. When present, it is rendered at the top of the lesson as a grammar note before learners begin the vocabulary parts.

`CourseLesson.type` should determine whether the lesson is a vocabulary lesson or a story lesson. When `type = story`, the lesson should point to a `Story` record and still participate in the normal lesson ordering for its section.

`CourseLesson.vocabularyType` should distinguish grammar-focused lessons, pure vocabulary lessons, and expression lessons.

### Add CEFR Planning Models

- `CefrEnglishTarget`
  - id
  - level
  - english
  - notes

- `WordCefrTarget`
  - wordId
  - cefrTargetId
  - notes

This supports the "hola -> A1: hello" and "comprender -> B1: understand" examples without coupling CEFR coverage to lesson section.

`CefrEnglishTarget.english` should allow spaces, because some reference targets will be phrases or infinitive-style entries such as `to search`. These entries do not need a separate word-versus-phrase classification.

### Add Story Coverage Models

- `StoryLemma`
  - id
  - storyId
  - wordId
  - occurrenceCount
  - firstSentenceOrder

- optional `StoryUnknownLemma`
  - used only if we want to track unresolved tokens before a `Word` entry exists

If story coverage can be computed efficiently from token links, `StoryLemma` may be materialized later rather than added immediately. The key requirement is that story coverage becomes queryable.

## Key Derived Queries

These queries will drive most of the product behavior:

- all lemmas taught before a given lesson
- all discovered lemmas not yet taught
- all sentence-ready lemmas not yet scheduled
- all CEFR English targets covered by a section or lesson
- all CEFR English targets still uncovered
- story coverage percentage based on taught lemmas
- stories sorted by "ready now" vs "needs more vocabulary"

## Admin UX Requirements

The first admin workflow should support:

- browsing sections, lessons, and lesson parts
- editing the optional grammar Markdown shown at the start of a lesson
- choosing whether a lesson is `vocabulary` or `story`
- choosing whether a vocabulary lesson is `grammar`, `vocab`, or `expression`
- creating lesson parts with a target size of `5-6` words
- assigning dictionary lemmas to lesson parts
- attaching or creating example sentences for each lesson item
- writing lesson-specific notes in Markdown
- linking lemmas to CEFR English targets
- viewing a backlog of discovered-but-untaught lemmas
- viewing story coverage and unknown vocabulary before publishing a story

Helpful but optional first-pass enhancements:

- warnings when a part has fewer than `5` or more than `6` target words
- warnings when a lesson has fewer than `2` or more than `3` parts
- warnings when a story introduces too many unknown lemmas

## Editorial Rules

These rules should be encoded clearly in the app:

- `Word` is the canonical lemma record.
- Lesson teaching is explicit and editorial, not inferred from dictionary existence.
- CEFR English coverage is attachable to any lemma regardless of current course level.
- CEFR English targets are guideline coverage markers, not a strict limit on what vocabulary may be taught.
- Each CEFR English target should appear once rather than being split into multiple sense-specific entries.
- Story readiness depends on taught lemmas, not merely discovered lemmas.
- A lemma counts as taught at the lesson level, because vocabulary lessons are the teaching unit.
- A story lesson does not itself make a lemma count as taught.

## Proposed Implementation Phases

### Phase 1: Planning And Schema

- add course structure tables
- add CEFR English target tables
- add lesson-part word assignment table
- define the taught state rules

### Phase 2: Editorial Admin Tools

- lesson/part CRUD
- lesson grammar Markdown editing
- lesson type selection and story lesson linking
- vocabulary lesson subtype selection
- assign words to parts
- attach sentence content
- CEFR mapping UI

### Phase 3: Story Coverage

- connect stories to lemma coverage reporting
- show discovered vs taught vocabulary
- surface candidate words for future lessons

### Phase 4: Publishing Flow

- publish lessons
- freeze teaching order
- show stories that become readable after publication

## Recommendation

Start by treating:

- `Word` as the canonical lemma
- `CourseLesson` as the teaching unit
- `LessonPartWord` as lesson content inside that teaching unit
- `ExampleSentence` as the canonical sample sentence record in the corpus
- lesson-specific teaching text as a layer on top of the shared sentence record
- `CefrEnglishTarget` as a separate English planning list that can contain single words or phrases
- CEFR coverage as a guideline for breadth rather than a strict vocabulary constraint
- story coverage as a computed report over linked lemmas

That gives us a clean editorial workflow now while leaving room for more automation later.
