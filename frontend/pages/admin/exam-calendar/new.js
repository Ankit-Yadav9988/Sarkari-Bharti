import AdminResourceEditor from '../../../components/AdminResourceEditor';
import ExamCalendarForm from '../../../components/ExamCalendarForm';

export default function NewExamCalendarEntry() {
  return (
    <AdminResourceEditor
      endpoint="exam-calendar"
      listHref="/admin/exam-calendar"
      addHeading="Add calendar entry"
      editHeading="Edit calendar entry"
      notFoundText="Calendar entry not found."
      addSubmitLabel="Publish entry"
      renderForm={props => <ExamCalendarForm {...props} />}
    />
  );
}
