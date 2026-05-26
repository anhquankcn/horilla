"""
urls.py

This module is used to map url pattern or request path with view functions
"""

from django.urls import include, path

from payroll.cbv import contracts, dashboard, payslip_automation
from payroll.models.models import Contract, Payslip
from payroll.views import bhxh_views, contract_hnh_views, dependent_views, pit_views, views

urlpatterns = [
    path("", include("payroll.urls.component_urls")),
    path("", include("payroll.urls.tax_urls")),
    path("contract-create", views.contract_create, name="contract-create"),
    path(
        "update-contract/<int:contract_id>",
        views.contract_update,
        name="update-contract",
        kwargs={"model": Contract},
    ),
    path(
        "update-contract-status/<int:contract_id>",
        views.contract_status_update,
        name="update-contract-status",
    ),
    path(
        "bulk-update-contract-status",
        views.bulk_contract_status_update,
        name="bulk-update-contract-status",
    ),
    path(
        "update-contract-filing-status/<int:contract_id>",
        views.update_contract_filing_status,
        name="update-contract-filing-status",
    ),
    path(
        "delete-contract/<int:contract_id>",
        views.contract_delete,
        name="delete-contract",
    ),
    path(
        "delete-contract-modal/<int:contract_id>",
        views.contract_delete,
        name="delete-contract-modal",
    ),
    # path("view-contract/", views.contract_view, name="view-contract"),
    path(
        "single-contract-view/<int:contract_id>/",
        views.view_single_contract,
        name="single-contract-view",
    ),
    path("payslip-pdf/<int:id>", views.payslip_pdf, name="payslip-pdf"),
    # path("contract-filter", views.contract_filter, name="contract-filter"),
    path("settings", views.settings, name="payroll-settings"),
    path(
        "payslip-status-update/<int:payslip_id>/",
        views.update_payslip_status,
        name="payslip-status-update",
    ),
    path(
        "payslip-status-update-no-id",
        views.update_payslip_status_no_id,
        name="payslip-status-update-no-id",
    ),
    path(
        "bulk-payslip-status-update",
        views.bulk_update_payslip_status,
        name="bulk-payslip-status-update",
    ),
    path(
        "view-payslip/<int:payslip_id>/",
        views.view_created_payslip,
        name="view-created-payslip",
        kwargs={"model": Payslip},
    ),
    path(
        "view-payslip-pdf/<int:payslip_id>/",
        views.view_payslip_pdf,
        name="view-payslip-pdf",
    ),
    path(
        "delete-payslip/<int:payslip_id>/", views.delete_payslip, name="delete-payslip"
    ),
    path(
        "contract-info-initial",
        views.contract_info_initial,
        name="contract-info-initial",
    ),
    path(
        "view-payroll-dashboard/",
        views.view_payroll_dashboard,
        name="view-payroll-dashboard",
    ),
    path(
        "dashboard-employee-chart",
        views.dashboard_employee_chart,
        name="dashboard-employee-chart",
    ),
    path(
        "dashboard-payslip-details",
        views.payslip_details,
        name="dashboard-payslip-details",
    ),
    path(
        "dashboard-department-chart",
        views.dashboard_department_chart,
        name="dashboard-department-chart",
    ),
    path(
        "dashboard-department-chart-list",
        dashboard.DashboardDepartmentPayslip.as_view(),
        name="dashboard-department-chart-list",
    ),
    # path(
    #     "dashboard-contract-ending",
    #     views.contract_ending,
    #     name="dashboard-contract-ending",
    # ),
    path(
        "dashboard-contract-ending",
        dashboard.DashboardContractList.as_view(),
        name="dashboard-contract-ending",
    ),
    path(
        "dashboard-contract-expired",
        dashboard.DashboardContractListExpired.as_view(),
        name="dashboard-contract-expired",
    ),
    path(
        "dashboard-export/",
        views.payslip_export,
        name="dashboard-export",
    ),
    path(
        "payslip-bulk-delete",
        views.payslip_bulk_delete,
        name="payslip-bulk-delete",
    ),
    path(
        "update-batch-group-name",
        views.slip_group_name_update,
        name="update-batch-group-name",
    ),
    path("contract-export", views.contract_export, name="contract-export"),
    # ===========================Người Phụ Thuộc NPT================================
    path(
        "dependent-tab/<int:pk>/",
        dependent_views.dependent_tab,
        name="dependent-tab",
    ),
    path(
        "dependent-create/<int:employee_id>/",
        dependent_views.dependent_create,
        name="dependent-create",
    ),
    path(
        "dependent-delete/<int:dep_id>/",
        dependent_views.dependent_delete,
        name="dependent-delete",
    ),
    path(
        "dependent-hr-panel/",
        dependent_views.dependent_hr_panel,
        name="dependent-hr-panel",
    ),
    path(
        "dependent-approve/<int:dep_id>/",
        dependent_views.dependent_approve,
        name="dependent-approve",
    ),
    path(
        "dependent-reject/<int:dep_id>/",
        dependent_views.dependent_reject,
        name="dependent-reject",
    ),
    path(
        "dependent-deactivate/<int:dep_id>/",
        dependent_views.dependent_deactivate,
        name="dependent-deactivate",
    ),
    path(
        "dependent-export/",
        dependent_views.dependent_export_csv,
        name="dependent-export",
    ),
    # BHXH/BHYT/BHTN
    path("bhxh/config/", bhxh_views.bhxh_config_list, name="bhxh-config-list"),
    path("bhxh/config/create/", bhxh_views.bhxh_config_create, name="bhxh-config-create"),
    path("bhxh/config/<int:config_id>/edit/", bhxh_views.bhxh_config_update, name="bhxh-config-update"),
    path("bhxh/report/", bhxh_views.bhxh_report, name="bhxh-report"),
    path("bhxh/compute/", bhxh_views.bhxh_compute_month, name="bhxh-compute"),
    path("bhxh/export/", bhxh_views.bhxh_export_csv, name="bhxh-export"),
    path("bhxh/employee/<int:employee_id>/info/", bhxh_views.bhxh_employee_info, name="bhxh-employee-info"),
    # Thuế TNCN (PIT)
    path("pit/config/", pit_views.pit_config_list, name="pit-config-list"),
    path("pit/config/create/", pit_views.pit_config_create, name="pit-config-create"),
    path("pit/config/<int:config_id>/edit/", pit_views.pit_config_update, name="pit-config-update"),
    path("pit/report/", pit_views.pit_report, name="pit-report"),
    path("pit/compute/", pit_views.pit_compute_month, name="pit-compute"),
    path("pit/export/", pit_views.pit_export_csv, name="pit-export"),
    path("pit/employee/<int:employee_id>/<int:year>/<int:month>/", pit_views.pit_employee_detail, name="pit-employee-detail"),
    # ───────── HNH Contract Types ────────────────────────────────────────────
    # Trial Contract (Hop dong Thu viec)
    path("hnh/trial/", contract_hnh_views.trial_contract_list, name="trial-contract-list"),
    path("hnh/trial/create/", contract_hnh_views.trial_contract_create, name="trial-contract-create"),
    path("hnh/trial/<int:pk>/", contract_hnh_views.trial_contract_detail, name="trial-contract-detail"),
    path("hnh/trial/<int:pk>/edit/", contract_hnh_views.trial_contract_update, name="trial-contract-update"),
    path("hnh/trial/<int:pk>/delete/", contract_hnh_views.trial_contract_delete, name="trial-contract-delete"),
    path("hnh/trial/<int:contract_pk>/kpi/add/", contract_hnh_views.trial_kpi_appendix_create, name="trial-kpi-appendix-create"),
    # Official Contract (Hop dong Chinh thuc)
    path("hnh/official/", contract_hnh_views.official_contract_list, name="official-contract-list"),
    path("hnh/official/create/", contract_hnh_views.official_contract_create, name="official-contract-create"),
    path("hnh/official/<int:pk>/edit/", contract_hnh_views.official_contract_update, name="official-contract-update"),
    path("hnh/official/<int:pk>/delete/", contract_hnh_views.official_contract_delete, name="official-contract-delete"),
    # Performance Contract (Hop dong Hieu suat)
    path("hnh/performance/", contract_hnh_views.performance_contract_list, name="performance-contract-list"),
    path("hnh/performance/create/", contract_hnh_views.performance_contract_create, name="performance-contract-create"),
    path("hnh/performance/<int:pk>/", contract_hnh_views.performance_contract_detail, name="performance-contract-detail"),
    path("hnh/performance/<int:pk>/edit/", contract_hnh_views.performance_contract_update, name="performance-contract-update"),
    path("hnh/performance/<int:pk>/delete/", contract_hnh_views.performance_contract_delete, name="performance-contract-delete"),
    # KPI Appendix (Phu luc 1)
    path("hnh/performance/<int:contract_pk>/kpi/add/", contract_hnh_views.kpi_appendix_create, name="kpi-appendix-create"),
    path("hnh/kpi/<int:pk>/delete/", contract_hnh_views.kpi_appendix_delete, name="kpi-appendix-delete"),
    path(
        "contract-bulk-delete",
        views.contract_bulk_delete,
        name="contract-bulk-delete",
    ),
    path("contract-select/", views.contract_select, name="contract-select"),
    path(
        "contract-select-filter/",
        views.contract_select_filter,
        name="contract-select-filter",
    ),
    path("payslip-select/", views.payslip_select, name="payslip-select"),
    path(
        "payslip-select-filter/",
        views.payslip_select_filter,
        name="payslip-select-filter",
    ),
    path(
        "payroll-request-add-comment/<int:payroll_id>/",
        views.create_payrollrequest_comment,
        name="payroll-request-add-comment",
    ),
    path(
        "payroll-request-view-comment/<int:payroll_id>/",
        views.view_payrollrequest_comment,
        name="payroll-request-view-comment",
    ),
    path(
        "payroll-request-delete-comment/<int:comment_id>/",
        views.delete_payrollrequest_comment,
        name="payroll-request-delete-comment",
    ),
    path(
        "delete-reimbursement-comment-file/",
        views.delete_reimbursement_comment_file,
        name="delete-reimbursement-comment-file",
    ),
    path(
        "initial-notice-period",
        views.initial_notice_period,
        name="initial-notice-period",
    ),
    path("view-contract/", contracts.ContractsView.as_view(), name="view-contract"),
    path("contract-filter/", contracts.ContractsList.as_view(), name="contract-filter"),
    path("contracts-nav/", contracts.ContractsNav.as_view(), name="contracts-nav"),
    path(
        "contracts-export/",
        contracts.ContractsExportView.as_view(),
        name="contracts-export",
    ),
    path(
        "contracts-detail-view/<int:pk>/",
        contracts.ContractsDetailView.as_view(),
        name="contracts-detail-view",
    ),
    # ===========================Auto payslip generate================================
    path(
        "auto-payslip-settings-view/",
        views.auto_payslip_settings_view,
        name="auto-payslip-settings-view",
    ),
    path(
        "create-auto-payslip",
        views.create_or_update_auto_payslip,
        name="create-auto-payslip",
    ),
    path(
        "update-auto-payslip/<int:auto_id>",
        views.create_or_update_auto_payslip,
        name="update-auto-payslip",
    ),
    path(
        "delete-auto-payslip/<int:auto_id>",
        views.delete_auto_payslip,
        name="delete-auto-payslip",
    ),
    path(
        "activate-auto-payslip-generate",
        views.activate_auto_payslip_generate,
        name="activate-auto-payslip-generate",
    ),
    path(
        "pay-slip-automation-list",
        payslip_automation.PaySlipAutomationListView.as_view(),
        name="pay-slip-automation-list",
    ),
    path(
        "pay-slip-automation-nav",
        payslip_automation.PaySlipAutomationNav.as_view(),
        name="pay-slip-automation-nav",
    ),
    path(
        "pay-slip-automation-create",
        payslip_automation.PaySlipAutomationFormView.as_view(),
        name="pay-slip-automation-create",
    ),
    path(
        "pay-slip-automation-update/<int:pk>/",
        payslip_automation.PaySlipAutomationFormView.as_view(),
        name="pay-slip-automation-update",
    ),
    path(
        "pay-slip-automation-delete/<int:auto_id>/",
        payslip_automation.DeleteAutoPayslipView.as_view(),
        name="pay-slip-automation-delete",
    ),
]
