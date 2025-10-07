EVENT-MANAGEMENT-SYSTEM [EMS]


1.This system is designed to manage and track campus event bookings, venue reservations, and resource allocation.
2.It is built using Node.js and Express, with all data stored safely on your computer using simple JSON files.
3.No setup for external databases is needed, making it quick to deploy and easy to maintain.

  ->There are three main parts you can access with your browser:

   1. Student Portal: Lets students see available venues, check what resources are free, and quickly request new events.
   2. Admin Panel: Allows authorized users to approve or reject bookings, manage venue details, and upload proof files for completed events.
   3. Dashboard: Displays a summary of all events, shows which venues and resources are booked, and flags any overlapping or conflicting bookings.

-> When you run it for the first time, the system automatically creates the setup folders and fills them with sample venues and resources for testing.

-> Students use the portal to:

  1.Browse venue details.
  2. Select available dates and times for new events.
  3. Submit requests including catering, transport, or stay requirements.
  4. View all their recently requested events and current status.

-> Admin users can:

 1. Add new venues or edit existing ones.
 2. Approve event requests and assign resources.
 3. Mark events as completed and upload documents, photos, or videos as proof.
 4. Remove or rename venues when needed.
 5. Instantly see upcoming events that may have time clashes or resource conflicts.

-> The dashboard is useful for both students and staff. It lists every event with its details, shows which venues and media are assigned, and highlights events on the same date.

-> All actions are done locally—there’s no login or external account needed to use the system.

-> The EMS automatically checks for double bookings and ensures that resources are only reserved for one event at a time.

==>To start using it:

1. Make sure Node.js is installed on your computer.
2. Download all project files into one folder.
3. Install backend packages before starting.
4. Run the main file and open the application in your web browser.

This tool is helpful for schools, colleges, or organizations that want to streamline event scheduling, avoid booking conflicts, and keep event records with proof files.
