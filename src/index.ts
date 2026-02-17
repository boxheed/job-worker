#!/usr/bin/env node
import { sayHello } from './lib.js';

const name = process.argv[2] || 'World';
console.log(sayHello(name));
