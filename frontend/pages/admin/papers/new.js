import AdminResourceEditor from '../../../components/AdminResourceEditor';
import PaperForm from '../../../components/PaperForm';

export default function NewPaper() {
  return (
    <AdminResourceEditor
      endpoint="papers"
      listHref="/admin/papers"
      addHeading="Add previous year paper"
      editHeading="Edit previous year paper"
      notFoundText="Paper not found."
      addSubmitLabel="Publish paper"
      renderForm={props => <PaperForm {...props} />}
    />
  );
}
