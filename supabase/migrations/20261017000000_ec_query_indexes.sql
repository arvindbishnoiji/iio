-- These indexes have already been applied to the connected Supabase project
-- by the ec_query_indexes migration. This file records the repeatable source.
create index if not exists ec_course_catalog_feed_idx
  on public.course_catalog (active, exam, kind, created_at desc);
create index if not exists ec_course_catalog_classes_gin_idx
  on public.course_catalog using gin (classes);
create index if not exists ec_exam_attempts_test_score_idx
  on public.exam_attempts (test_id, exam, class_level, score desc, submitted_at asc);
create index if not exists ec_exam_attempts_user_idx
  on public.exam_attempts (firebase_uid, submitted_at desc);
create index if not exists ec_enrollments_user_active_idx
  on public.enrollments (firebase_uid, active, item_type);
create index if not exists ec_lesson_progress_user_lecture_idx
  on public.lesson_progress (firebase_uid, lecture_id);
create index if not exists ec_announcements_active_schedule_idx
  on public.announcements (active, scheduled_at desc);