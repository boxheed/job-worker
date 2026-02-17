import { describe, it, expect } from 'vitest';
import { sayHello } from '../src/lib.js';

describe('sayHello', () => {
  it('should return "Hello, World!" when no name is provided', () => {
    expect(sayHello()).toBe('Hello, World!');
  });

  it('should return "Hello, Alice!" when "Alice" is provided', () => {
    expect(sayHello('Alice')).toBe('Hello, Alice!');
  });
});
