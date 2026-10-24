CREATE TABLE guestbook_entries (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(40) NOT NULL,
  message VARCHAR(1000) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Match JavaScript String.trim() whitespace, including Unicode spaces and BOM.
  CONSTRAINT guestbook_name_nonblank CHECK (
    char_length(btrim(name, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')) > 0
  ),
  CONSTRAINT guestbook_message_nonblank CHECK (
    char_length(btrim(message, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')) > 0
  )
);
