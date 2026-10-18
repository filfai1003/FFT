import { cleanContext, describeError, ReportCode } from './error-report';

describe('error reports keep no user input (DECISIONS 96)', () => {
  it('drops the message of ordinary and database errors, keeps name and code', () => {
    const typed = new Error('could not save "Mum\'s lasagne" for anna@mail.it');
    typed.stack = `Error: could not save "Mum's lasagne"\n    at save (index.android.bundle:1:2345)\nanother line of the message\n    at run (index.android.bundle:1:99)`;
    const r = describeError(typed);
    expect(r.message).toBe('Error');
    expect(r.stack).toBe(
      'at save (index.android.bundle:1:2345)\nat run (index.android.bundle:1:99)',
    );
    expect(JSON.stringify(r)).not.toMatch(/lasagne|anna/);

    const pg = { message: 'duplicate key value: Key (name)=(Pizza)', code: '23505', details: 'x' };
    expect(describeError(pg)).toEqual({ message: 'Error', stack: null, code: '23505' });
    expect(describeError('free text the user wrote').message).toBe('string');
  });

  it('keeps fixed texts from the code and scrubbed engine messages', () => {
    expect(describeError(new ReportCode('sync refused a row')).message).toBe('sync refused a row');
    expect(describeError(new TypeError("Cannot read property 'name' of undefined")).message).toBe(
      "TypeError: Cannot read property 'name' of undefined",
    );
    expect(
      describeError(new TypeError('Value "my weight is 82 kg" at 12 for x@y.z is not a function'))
        .message,
    ).toBe('TypeError: Value "?" at # for ?@? is not a function');
  });

  it('context: only known keys with plain short values', () => {
    expect(
      cleanContext({
        table: 'food_logs',
        code: '23505',
        count: 3,
        note: 'my secret',
        what: 'free text, with punctuation!',
        screen: '/diet/day',
      }),
    ).toEqual({ table: 'food_logs', code: '23505', count: 3, screen: '/diet/day' });
    expect(cleanContext({ note: 'x' })).toBeNull();
  });
});
