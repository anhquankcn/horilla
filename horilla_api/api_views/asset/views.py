from datetime import date

from django.http import QueryDict
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from asset.filters import AssetFilter
from asset.models import *

from ...api_filters.asset.filters import AssetCategoryFilter
from ...api_serializers.asset.serializers import *


class AssetAPIView(APIView):
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_class = AssetFilter

    def get_asset(self, pk):
        try:
            return Asset.objects.get(pk=pk)
        except Asset.DoesNotExist as e:
            raise serializers.ValidationError(e)

    def get(self, request, pk=None):
        if pk:
            asset = self.get_asset(pk)
            serializer = AssetSerializer(asset)
            return Response(serializer.data)
        paginator = PageNumberPagination()
        queryset = Asset.objects.all()
        filterset = self.filterset_class(request.GET, queryset=queryset)
        page = paginator.paginate_queryset(filterset.qs, request)
        serializer = AssetGetAllSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        serializer = AssetSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def put(self, request, pk):
        asset = self.get_asset(pk)
        serializer = AssetSerializer(asset, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        asset = self.get_asset(pk)
        asset.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AssetCategoryAPIView(APIView):
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_class = AssetCategoryFilter

    def get_asset_category(self, pk):
        try:
            return AssetCategory.objects.get(pk=pk)
        except AssetCategory.DoesNotExist as e:
            raise serializers.ValidationError(e)

    def get(self, request, pk=None):
        if pk:
            asset_category = self.get_asset_category(pk)
            serializer = AssetCategorySerializer(asset_category)
            return Response(serializer.data)
        paginator = PageNumberPagination()
        queryset = AssetCategory.objects.all()
        filterset = self.filterset_class(request.GET, queryset=queryset)
        page = paginator.paginate_queryset(filterset.qs, request)
        serializer = AssetCategorySerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        serializer = AssetCategorySerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def put(self, request, pk):
        asset_category = self.get_asset_category(pk)
        serializer = AssetCategorySerializer(asset_category, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        asset_category = self.get_asset_category(pk)
        asset_category.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AssetLotAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get_asset_lot(self, pk):
        try:
            return AssetLot.objects.get(pk=pk)
        except AssetLot.DoesNotExist as e:
            raise serializers.ValidationError(e)

    def get(self, request, pk=None):
        if pk:
            asset_lot = self.get_asset_lot(pk)
            serializer = AssetLotSerializer(asset_lot)
            return Response(serializer.data)
        paginator = PageNumberPagination()
        assets = AssetLot.objects.all()
        page = paginator.paginate_queryset(assets, request)
        serializer = AssetLotSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        serializer = AssetLotSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def put(self, request, pk):
        asset_lot = self.get_asset_lot(pk)
        serializer = AssetLotSerializer(asset_lot, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        asset_lot = self.get_asset_lot(pk)
        asset_lot.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AssetAllocationAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get_asset_assignment(self, pk):
        try:
            return AssetAssignment.objects.get(pk=pk)
        except AssetAssignment.DoesNotExist as e:
            raise serializers.ValidationError(e)

    def get(self, request, pk=None):
        if pk:
            asset_assignment = self.get_asset_assignment(pk)
            serializer = AssetAssignmentGetSerializer(asset_assignment)
            return Response(serializer.data)
        paginator = PageNumberPagination()
        assets = AssetAssignment.objects.all()
        page = paginator.paginate_queryset(assets, request)
        serializer = AssetAssignmentGetSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        serializer = AssetAssignmentSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def put(self, request, pk):
        asset_assignment = self.get_asset_assignment(pk)
        serializer = AssetAssignmentSerializer(asset_assignment, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        asset_assignment = self.get_asset_assignment(pk)
        asset_assignment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AssetRequestAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get_asset_request(self, pk):
        try:
            return AssetRequest.objects.get(pk=pk)
        except AssetRequest.DoesNotExist as e:
            raise serializers.ValidationError(e)

    def get(self, request, pk=None):
        if pk:
            asset_request = self.get_asset_request(pk)
            serializer = AssetRequestGetSerializer(asset_request)
            return Response(serializer.data)
        paginator = PageNumberPagination()
        assets = AssetRequest.objects.all().order_by("-id")
        page = paginator.paginate_queryset(assets, request)
        serializer = AssetRequestGetSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        serializer = AssetRequestSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def put(self, request, pk):
        asset_request = self.get_asset_request(pk)
        serializer = AssetRequestSerializer(asset_request, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        asset_request = self.get_asset_request(pk)
        asset_request.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AssetRejectAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get_asset_request(self, pk):
        try:
            return AssetRequest.objects.get(pk=pk)
        except AssetRequest.DoesNotExist as e:
            raise serializers.ValidationError(e)

    def put(self, request, pk):
        asset_request = self.get_asset_request(pk)
        if asset_request.asset_request_status == "Requested":
            asset_request.asset_request_status = "Rejected"
            asset_request.save()
            return Response(status=204)
        raise serializers.ValidationError({"error": "Access Denied.."})


class AssetApproveAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get_asset_request(self, pk):
        try:
            return AssetRequest.objects.get(pk=pk)
        except AssetRequest.DoesNotExist as e:
            raise serializers.ValidationError(e)

    def put(self, request, pk):
        asset_request = self.get_asset_request(pk)
        if asset_request.asset_request_status == "Requested":
            data = request.data
            if isinstance(data, QueryDict):
                data = data.dict()
            data["assigned_to_employee_id"] = asset_request.requested_employee_id.id
            data["assigned_by_employee_id"] = request.user.employee_get.id
            serializer = AssetApproveSerializer(
                data=data, context={"asset_request": asset_request}
            )
            if serializer.is_valid():
                serializer.save()
                asset_id = Asset.objects.get(id=data["asset_id"])
                asset_id.asset_status = "In use"
                asset_id.save()
                asset_request.asset_request_status = "Approved"
                asset_request.save()
                return Response(status=200)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        raise serializers.ValidationError({"error": "Access Denied.."})


class AssetReturnAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get_asset_assignment(self, pk):
        try:
            return AssetAssignment.objects.get(pk=pk)
        except AssetAssignment.DoesNotExist as e:
            raise serializers.ValidationError(e)

    def put(self, request, pk):
        asset_assignment = self.get_asset_assignment(pk)
        if request.user.has_perm("app_name.change_mymodel"):
            serializer = AssetReturnSerializer(
                instance=asset_assignment, data=request.data
            )
            if serializer.is_valid():
                images = [
                    ReturnImages.objects.create(image=image)
                    for image in request.data.getlist("image")
                ]
                asset_return = serializer.save()
                asset_return.return_images.set(images)
                if asset_return.return_status == "Healthy":
                    Asset.objects.filter(id=pk).update(asset_status="Available")
                else:
                    Asset.objects.filter(id=pk).update(asset_status="Not-Available")
                AssetAssignment.objects.filter(id=asset_return.id).update(
                    return_date=date.today()
                )
                return Response(status=200)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        else:
            AssetAssignment.objects.filter(id=pk).update(return_request=True)
            return Response(status=200)


class MyAssetRequestsView(APIView):
    """List current user's asset requests for proposals hub."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        employee = request.user.employee_get
        status_filter = request.GET.get("status", "")

        qs = AssetRequest.objects.filter(
            requested_employee_id=employee
        ).select_related("asset_category_id").order_by("-id")

        if status_filter:
            qs = qs.filter(asset_request_status=status_filter)

        data = []
        for ar in qs[:50]:
            data.append({
                "id": ar.id,
                "category_name": ar.asset_category_id.asset_category_name if ar.asset_category_id else None,
                "category_id": ar.asset_category_id.id if ar.asset_category_id else None,
                "description": ar.description or "",
                "status": ar.asset_request_status or "Requested",
                "request_date": ar.asset_request_date.isoformat() if ar.asset_request_date else None,
            })

        return Response(data)


class AssetPWADashboardView(APIView):
    """Combined asset data for PWA management page."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        status_filter = request.GET.get("status", "")
        category_filter = request.GET.get("category", "")
        tab = request.GET.get("tab", "assets")
        search = request.GET.get("search", "").strip()

        total = Asset.objects.count()
        in_use = Asset.objects.filter(asset_status="In use").count()
        available = Asset.objects.filter(asset_status="Available").count()
        not_available = Asset.objects.filter(asset_status="Not-Available").count()
        pending_requests = AssetRequest.objects.filter(
            asset_request_status="Requested"
        ).count()

        categories = []
        for cat in AssetCategory.objects.all().order_by("asset_category_name"):
            categories.append({
                "id": cat.id,
                "name": cat.asset_category_name,
                "count": cat.asset_set.count(),
            })

        result = {
            "summary": {
                "total": total,
                "in_use": in_use,
                "available": available,
                "not_available": not_available,
                "pending_requests": pending_requests,
            },
            "categories": categories,
        }

        if tab == "assets":
            qs = Asset.objects.select_related(
                "asset_category_id", "owner", "asset_lot_number_id"
            ).order_by("-created_at")
            if status_filter:
                qs = qs.filter(asset_status=status_filter)
            if category_filter:
                qs = qs.filter(asset_category_id=int(category_filter))
            if search:
                qs = qs.filter(
                    models.Q(asset_name__icontains=search)
                    | models.Q(asset_tracking_id__icontains=search)
                )
            assets = []
            for a in qs[:100]:
                assets.append({
                    "id": a.id,
                    "name": a.asset_name,
                    "tracking_id": a.asset_tracking_id,
                    "status": a.asset_status,
                    "category": a.asset_category_id.asset_category_name if a.asset_category_id else None,
                    "category_id": a.asset_category_id.id if a.asset_category_id else None,
                    "owner_name": a.owner.get_full_name() if a.owner else None,
                    "owner_id": a.owner.id if a.owner else None,
                    "purchase_date": a.asset_purchase_date.isoformat() if a.asset_purchase_date else None,
                    "cost": str(a.asset_purchase_cost) if a.asset_purchase_cost else None,
                    "description": a.asset_description or "",
                    "lot": a.asset_lot_number_id.lot_number if a.asset_lot_number_id else None,
                    "expiry_date": a.expiry_date.isoformat() if a.expiry_date else None,
                })
            result["assets"] = assets

        elif tab == "assignments":
            qs = AssetAssignment.objects.filter(
                return_date__isnull=True
            ).select_related(
                "asset_id", "asset_id__asset_category_id",
                "assigned_to_employee_id", "assigned_by_employee_id",
            ).order_by("-assigned_date")
            if search:
                qs = qs.filter(
                    models.Q(asset_id__asset_name__icontains=search)
                    | models.Q(assigned_to_employee_id__employee_first_name__icontains=search)
                    | models.Q(assigned_to_employee_id__employee_last_name__icontains=search)
                )
            assignments = []
            for aa in qs[:100]:
                emp = aa.assigned_to_employee_id
                dept = ""
                if hasattr(emp, "employee_work_info") and emp.employee_work_info:
                    dept = str(emp.employee_work_info.department_id or "")
                assignments.append({
                    "id": aa.id,
                    "asset_name": aa.asset_id.asset_name if aa.asset_id else "—",
                    "asset_tracking_id": aa.asset_id.asset_tracking_id if aa.asset_id else "",
                    "category": aa.asset_id.asset_category_id.asset_category_name if aa.asset_id and aa.asset_id.asset_category_id else "",
                    "employee_name": emp.get_full_name() if emp else "—",
                    "employee_id": emp.id if emp else None,
                    "department": dept,
                    "assigned_date": aa.assigned_date.isoformat() if aa.assigned_date else None,
                    "return_request": aa.return_request,
                })
            result["assignments"] = assignments

        elif tab == "requests":
            qs = AssetRequest.objects.select_related(
                "requested_employee_id", "asset_category_id"
            ).order_by("-id")
            req_status = request.GET.get("req_status", "")
            if req_status:
                qs = qs.filter(asset_request_status=req_status)
            if search:
                qs = qs.filter(
                    models.Q(requested_employee_id__employee_first_name__icontains=search)
                    | models.Q(requested_employee_id__employee_last_name__icontains=search)
                    | models.Q(asset_category_id__asset_category_name__icontains=search)
                )
            requests_list = []
            for ar in qs[:100]:
                requests_list.append({
                    "id": ar.id,
                    "employee_name": ar.requested_employee_id.get_full_name() if ar.requested_employee_id else "—",
                    "employee_id": ar.requested_employee_id.id if ar.requested_employee_id else None,
                    "category_name": ar.asset_category_id.asset_category_name if ar.asset_category_id else "—",
                    "description": ar.description or "",
                    "status": ar.asset_request_status or "Requested",
                    "request_date": ar.asset_request_date.isoformat() if ar.asset_request_date else None,
                })
            result["requests"] = requests_list

        return Response(result)
