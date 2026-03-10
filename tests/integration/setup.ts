process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5432/magnus';
process.env.JWT_SECRET ??= 'test-jwt-secret-must-be-at-least-32-chars-long';
process.env.ENCRYPTION_KEY ??= '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.ANTHROPIC_API_KEY ??= 'sk-ant-test';