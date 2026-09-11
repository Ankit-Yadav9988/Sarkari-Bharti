import AdminResourceList from '../../../components/AdminResourceList';
import { fetchExamCalendar, categoryLabel, formatDate } from '../../../lib/api';

/**
 * The admin calendar list.
 *
 * fetchExamCalendar is called without `upcoming`, so the backend default of false
 * applies and past rows stay visible. That is the whole point of the default being
 * false: an admin fixing last month's exam date has to be able to find it.
 */
export default function ManageExamCalendar() {
  return (
    <AdminResourceList
      heading="Exam calendar"
      endpoint="exam-calendar"
      fetcher={fetchExamCalendar}
      newHref="/admin/exam-calendar/new"
      newLabel="+ Add entry"
      emptyText="No calendar entries yet."
      editHref={e => `/admin/exam-calendar/edit/${e.id}`}
      describe={e => ({
        title: e.examName,
        sub: [
          e.examDate ? `Exam ${formatDate(e.examDate)}` : 'Exam date TBA',
          e.tentative ? 'tentative' : null,
          e.organization,
          categoryLabel(e.category),
        ].filter(Boolean).join(' · '),
      })}
    />
  );
}
