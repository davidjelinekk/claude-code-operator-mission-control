#!/usr/bin/env node
import { scaffold } from './scaffold.js'

const targetDir = process.argv[2]

if (!targetDir) {
  console.error('Usage: create-cc-operator <project-name>')
  process.exit(1)
}

scaffold(targetDir).catch((err) => {
  console.error(err)
  process.exit(1)
})
