# Deutsch Trainer

Deutsch Trainer is a Ukrainian-language learning app for German verbs and prepositions. All six levels are available from the start. The vocabulary, exercises, and statistics work locally once the application has been cached.

The [Vocabulary Audit](VOCABULARY_AUDIT.md) documents the constructions, sources, red markings, and decisions concerning ambiguous entries.

## Local Development

Node.js 24 and npm are required.

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run build
npm run preview
```

Open `/deutsch-trainer/` on the local Vite address. To test the service worker, use the production build via `npm run preview`. The `npm run build` command also checks the manifest, base path, and contents of the Workbox precache.

## Exercises

The **Priority** filter is enabled by default. Switching to **All** expands the vocabulary, exercises, and list of mistakes. A complete Level 1 session in one direction asks one question per construction; in both directions, it asks two. In a mixed session with one question per construction, the directions alternate. In other levels, question availability depends on the structure of each construction. For full-sentence translation exercises, learners assess their own answers after viewing a reference answer.

## Progress and Review

Each IndexedDB record is identified by a pair: **construction ID + exercise type**. Dexie updates the counters, current streak of correct answers, last attempt, next review date, and priority in a single transaction.

- An incorrect answer resets the streak, adds 2 to the priority, and schedules a review in 10 minutes.
- A correct answer increases the streak by 1 and decreases the priority by 1, to a minimum of 0. Review intervals are 1, 2, 4, 8, 16, and 32 days, followed by 60 days.
- For short sessions and Level 6, a construction's weight is 1 plus three times its total priority, plus 1 for each record whose review is due. Selection is weighted without replacement. Given a fixed time and random number generator, the result is reproducible.
- **My Mistakes** displays constructions that have a record with at least one incorrect answer and a nonzero priority. Review sessions favor the corresponding exercise type.

In Settings, **Export Progress** downloads a JSON file containing results and the vocabulary selection. Import validates the version, records, and IDs, then replaces the data in a single transaction after confirmation. Reset deletes the results after confirmation. Exporting is useful for transferring data to another device or between application URLs.

The old standalone HTML stores only aggregate counters and unresolved mistakes under keys based on numeric indices. Import accepts backups from the new PWA. Progress saved in the old HTML remains available there.

## GitHub Pages

1. In the repository, open `Settings → Pages` and select `GitHub Actions` as the source.
2. After a push to `main`, the workflow builds the PWA, runs tests, and publishes `dist`. You can also start the workflow manually from the Actions tab.
3. After deployment, the URL should look like `https://<username>.github.io/deutsch-trainer/`.

Vite uses `/deutsch-trainer/`, and the manifest and service worker are scoped to the application's path.

## iPhone and Offline Testing

1. Open the published site in Safari while connected to the internet.
2. Open the trainer's Settings and wait for the **Ready for Offline Use** status.
3. In Safari, select **Share → Add to Home Screen**. Open the installed app and check the status again.
4. Enable Airplane Mode and turn off Wi-Fi if it remains enabled. Close and reopen the app. Open the dictionary, complete an exercise, restart the app, and verify the counters.
5. When Settings indicates that a new version is available, finish your current session and tap **Update**.
