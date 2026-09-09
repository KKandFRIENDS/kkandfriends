#!/usr/bin/env node
import { runWeeklyPipeline } from '../src/pipeline.js';
import { sampleWeekInput } from '../fixtures/sample-week.js';

const result = runWeeklyPipeline(sampleWeekInput);
process.stdout.write(`${result.markdown}\n`);
process.exitCode = result.ready ? 0 : 1;
