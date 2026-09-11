import AdminResourceList from '../../../components/AdminResourceList';
import { fetchCutoffs, categoryLabel, formatDate } from '../../../lib/api';

// The row subtitle leads with the exam year because that is what distinguishes two
// otherwise identically-titled cut-offs, and it is the field the admin is most
// likely to have got wrong.
export default function ManageCutoffs() {
  return (
    <AdminResourceList
      heading="Cut offs"
      endpoint="cutoffs"
      fetcher={fetchCutoffs}
      newHref="/admin/cutoffs/new"
      newLabel="+ Add cut off"
      emptyText="No cut offs posted yet."
      editHref={c => `/admin/cutoffs/edit/${c.id}`}
      describe={c => ({
        title: c.title,
        sub: [
          c.examYear,
          c.organization,
          categoryLabel(c.category),
          c.state,
          c.publishedDate ? formatDate(c.publishedDate) : null,
        ].filter(Boolean).join(' · '),
      })}
    />
  );
}
