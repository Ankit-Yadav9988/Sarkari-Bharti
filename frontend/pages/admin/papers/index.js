import AdminResourceList from '../../../components/AdminResourceList';
import { fetchPapers, categoryLabel } from '../../../lib/api';

// "Answer key" and "with solutions" are surfaced in the subtitle because they are the
// two fields a visitor filters on mentally and the two an admin forgets to fill in.
export default function ManagePapers() {
  return (
    <AdminResourceList
      heading="Previous year papers"
      endpoint="papers"
      fetcher={fetchPapers}
      newHref="/admin/papers/new"
      newLabel="+ Add paper"
      emptyText="No papers posted yet."
      editHref={p => `/admin/papers/edit/${p.id}`}
      describe={p => ({
        title: p.title,
        sub: [
          p.examYear,
          p.paperStage,
          p.language,
          categoryLabel(p.category),
          p.answerKeyLink ? 'answer key' : null,
          p.hasSolution ? 'with solutions' : null,
        ].filter(Boolean).join(' · '),
      })}
    />
  );
}
