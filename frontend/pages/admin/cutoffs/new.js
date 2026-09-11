import AdminResourceEditor from '../../../components/AdminResourceEditor';
import CutoffForm from '../../../components/CutoffForm';

export default function NewCutoff() {
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
