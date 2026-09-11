import AdminResourceEditor from '../../../../components/AdminResourceEditor';
import CutoffForm from '../../../../components/CutoffForm';

// Identical to new.js on purpose — AdminResourceEditor switches to edit mode off the
// presence of router.query.id, which only this route supplies. Two thin files rather
// than one shared page component so the URLs stay conventional for the pages router.
export default function EditCutoff() {
  return (
    <AdminResourceEditor
      endpoint="cutoffs"
      listHref="/admin/cutoffs"
      addHeading="Add cut off"
      editHeading="Edit cut off"
      notFoundText="Cut off not found."
      addSubmitLabel="Publish cut off"
      renderForm={props => <CutoffForm {...props} />}
    />
  );
}
