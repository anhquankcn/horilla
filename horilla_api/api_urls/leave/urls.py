"""
horilla_api/urls/leave/urls.py
"""

from django.urls import path

from horilla_api.api_views.leave.views import *
from horilla_api.api_views.leave import leave_management_views as lmv

urlpatterns = [
    path("available-leave/", EmployeeAvailableLeaveGetAPIView.as_view()),
    path("user-request/", EmployeeLeaveRequestGetCreateAPIView.as_view()),
    path("user-request-days/", EmployeeLeaveRequestDaysAPIView.as_view()),
    path("user-request-hours/", EmployeeLeaveRequestHoursAPIView.as_view()),
    path("user-request/<int:pk>/", EmployeeLeaveRequestUpdateDeleteAPIView.as_view()),
    path("leave-type/", LeaveTypeGetCreateAPIView.as_view()),
    path("leave-type/<int:pk>/", LeaveTypeGetUpdateDeleteAPIView.as_view()),
    path("allocation-request/", LeaveAllocationRequestGetCreateAPIView.as_view()),
    path(
        "allocation-request/<int:pk>/",
        LeaveAllocationRequestGetUpdateDeleteAPIView.as_view(),
    ),
    path("assign-leave/", AssignLeaveGetCreateAPIView.as_view()),
    path("assign-leave/<int:pk>/", AssignLeaveGetUpdateDeleteAPIView.as_view()),
    path("request/", LeaveRequestGetCreateAPIView.as_view()),
    path("request/<int:pk>/", LeaveRequestGetUpdateDeleteAPIView.as_view()),
    path("company-leave/", CompanyLeaveGetCreateAPIView.as_view()),
    path("company-leave/<int:pk>/", CompanyLeaveGetUpdateDeleteAPIView.as_view()),
    path("holiday/", HolidayGetCreateAPIView.as_view()),
    path("holiday/<int:pk>/", HolidayGetUpdateDeleteAPIView.as_view()),
    path("approve/<int:pk>/", LeaveRequestApproveAPIView.as_view()),
    path("reject/<int:pk>/", LeaveRequestRejectAPIView.as_view()),
    path("cancel/<int:pk>/", LeaveRequestCancelAPIView.as_view()),
    path("allocation-approve/<int:pk>/", LeaveAllocationApproveAPIView.as_view()),
    path("allocation-reject/<int:pk>/", LeaveAllocationRequestRejectAPIView.as_view()),
    path("request-bulk-action/", LeaveRequestBulkApproveDeleteAPIview.as_view()),
    path("user-allocation-request/", EmployeeLeaveAllocationGetCreateAPIView.as_view()),
    path(
        "user-allocation-request/<int:pk>/",
        EmployeeLeaveAllocationUpdateDeleteAPIView.as_view(),
    ),
    path("status/", LeaveRequestedApprovedCountAPIView.as_view()),
    path(
        "employee-leave-type/<int:pk>/", EmployeeAvailableLeaveTypeGetAPIView.as_view()
    ),
    path("check-type/", LeaveTypeGetPermissionCheckAPIView.as_view()),
    path("check-allocation/", LeaveAllocationGetPermissionCheckAPIView.as_view()),
    path("check-request/", LeaveRequestGetPermissionCheckAPIView.as_view()),
    path("check-assign/", LeaveAssignGetPermissionCheckAPIView.as_view()),
    path("check-perm/", LeavePermissionCheckAPIView.as_view()),
    # ── PWA Proposals & Approvals ──
    path("my-proposals/", MyProposalsView.as_view(), name="api-leave-my-proposals"),
    path("my-summary/", MyLeaveSummaryView.as_view(), name="api-leave-my-summary"),
    path("available-managers/", AvailableManagersView.as_view(), name="api-leave-available-managers"),
    path("watcher-candidates/", WatcherCandidatesView.as_view(), name="api-leave-watcher-candidates"),
    path("cb-managers/", CBLeaveManagersView.as_view(), name="api-leave-cb-managers"),
    path("select-candidates/", LeaveSelectCandidatesView.as_view(), name="api-leave-select-candidates"),
    path("watching/", WatchingLeaveRequestsView.as_view(), name="api-leave-watching"),
    path("pending-approvals/", PendingApprovalsView.as_view(), name="api-leave-pending-approvals"),
    path("pwa-approve/<int:pk>/", ApproveLeaveView.as_view(), name="api-leave-pwa-approve"),
    path("pwa-reject/<int:pk>/", RejectLeaveView.as_view(), name="api-leave-pwa-reject"),
    # ── HNH Leave Management ──
    path("hnh-leave-summary/", lmv.HNHLeaveSummaryView.as_view(), name="api-leave-hnh-summary"),
    path("hnh-compensatory/", lmv.HNHCompensatoryProposalListCreateView.as_view(), name="api-leave-hnh-compensatory"),
    path("hnh-compensatory/<int:pk>/approve/", lmv.HNHCompensatoryProposalApproveView.as_view(), name="api-leave-hnh-comp-approve"),
    path("hnh-compensatory/<int:pk>/reject/", lmv.HNHCompensatoryProposalRejectView.as_view(), name="api-leave-hnh-comp-reject"),
    path("hnh-compensatory/<int:pk>/", lmv.HNHCompensatoryProposalDeleteView.as_view(), name="api-leave-hnh-comp-delete"),
    path("hnh-team-employees/", lmv.HNHTeamEmployeesView.as_view(), name="api-leave-hnh-team"),
    path("export-excel/", lmv.LeaveExcelExportView.as_view(), name="api-leave-export-excel"),
    path("hnh-leave-overview/", lmv.HNHLeaveOverviewView.as_view(), name="api-leave-hnh-overview"),
    path("hnh-leave-detail/", lmv.HNHLeaveDetailView.as_view(), name="api-leave-hnh-detail"),
    path("hnh-adjust-balance/", lmv.HNHAdjustBalanceView.as_view(), name="api-leave-hnh-adjust-balance"),
    path("hnh-approved-leaves/", lmv.HNHApprovedLeavesView.as_view(), name="api-leave-hnh-approved-leaves"),
    path("hnh-leave-counts/", lmv.HNHLeaveCountsView.as_view(), name="api-leave-hnh-leave-counts"),
    path("hnh-mark-seen/<int:pk>/", lmv.HNHMarkLeaveSeenView.as_view(), name="api-leave-hnh-mark-seen"),
    path("hnh-leave-request-detail/<int:pk>/", lmv.HNHLeaveRequestDetailView.as_view(), name="api-leave-hnh-request-detail"),
    path("hnh-cancel-approved/<int:pk>/", lmv.HNHCancelApprovedView.as_view(), name="api-leave-hnh-cancel-approved"),
    path("hnh-cb-managers/", lmv.HNHCBManagersView.as_view(), name="api-leave-hnh-cb-managers"),
    path("hnh-cb-managers/<int:pk>/", lmv.HNHCBManagerDetailView.as_view(), name="api-leave-hnh-cb-manager-detail"),
    path("hnh-approver-map/", lmv.HNHApproverMapView.as_view(), name="api-leave-hnh-approver-map"),
    path("hnh-leave-import/template/", lmv.LeaveImportTemplateView.as_view(), name="api-leave-import-template"),
    path("hnh-leave-import/", lmv.LeaveImportView.as_view(), name="api-leave-import"),
]
