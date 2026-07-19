export default function UserRentalPanel({ ctx }) {
  const {
    Badge,
    Button,
    Card,
    CardContent,
    Info,
    LockIcon,
    STATUS,
    Search,
    availabilityFilter,
    availableFilterLabel,
    currentAuthRoleErrorMessage,
    currentAuthRoleReady,
    currentUserRentalRestrictionStatus,
    currentUserRestrictionReady,
    data,
    filteredLaptops,
    firebaseAuthReady,
    firebaseAuthUser,
    form,
    formatDateWithKoreanWeekday,
    getLaptopRentalAvailability,
    getSafeMaxRentalDays,
    getUserLaptopStatusLabel,
    goToUserLogin,
    goToUserMypage,
    isCurrentFirebaseAuthGeneralUser,
    isPeriodBasedRentalMode,
    motion,
    query,
    rentalDeviceSectionDescription,
    rentalDeviceSectionTitle,
    rentalPeriodFields,
    rentalStartAdjustmentInfo,
    requestSubmitLoading,
    selectedAssetCategory,
    selectedLaptop,
    selectedLaptopAvailability,
    selectedLaptopId,
    setAvailabilityFilter,
    setForm,
    setQuery,
    setSelectedAssetCategory,
    setSelectedLaptopId,
    submitRequest,
    unavailableFilterLabel,
    userProfile,
    userProfileReady,
  } = ctx;

  if (
    !firebaseAuthReady ||
    !currentAuthRoleReady ||
    !userProfileReady ||
    !currentUserRestrictionReady
  ) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="text-sm font-bold text-slate-900">
            로그인 계정과 대여 가능 상태를 확인하는 중입니다.
          </div>
          <p className="mt-2 text-xs text-slate-500">
            확인이 완료되면 대여 신청 화면이 표시됩니다.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (
    !firebaseAuthUser ||
    !isCurrentFirebaseAuthGeneralUser ||
    currentAuthRoleErrorMessage
  ) {
    return (
      <Card className="mk-brand-border-soft shadow-sm shadow-slate-100">
        <CardContent className="p-8 text-center">
          <h2 className="text-lg font-bold text-slate-900">
            대여 신청은 로그인 후 이용할 수 있습니다.
          </h2>
          <p className="mt-2 text-xs leading-6 text-slate-500">
            승인된 일반회원 계정으로 로그인하면 본인의 이름과 부서가 자동으로 신청자 정보에 적용됩니다.
          </p>
          <Button
            type="button"
            variant="primary"
            onClick={goToUserLogin}
            className="mt-5 justify-center"
          >
            로그인
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!userProfile || userProfile.status !== 'active') {
    return (
      <Card className="mk-brand-border-soft shadow-sm shadow-slate-100">
        <CardContent className="p-8 text-center">
          <h2 className="text-lg font-bold text-slate-900">
            대여 신청에 사용할 회원 정보를 확인할 수 없습니다.
          </h2>
          <p className="mt-2 text-xs leading-6 text-slate-500">
            이름과 부서가 등록된 승인 상태의 일반회원만 대여를 신청할 수 있습니다.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={goToUserMypage}
            className="mt-5 justify-center"
          >
            마이페이지 확인
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
          /* ==================== [사용자 대여 화면] ==================== */
          <div className="space-y-6">
            {currentUserRentalRestrictionStatus?.blocked && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-semibold leading-6 text-rose-800">
                {currentUserRentalRestrictionStatus.message}
              </div>
            )}

            <Card className="mk-brand-border-soft shadow-sm shadow-slate-100">
              <CardContent className="p-6">
                <div className="mb-5 flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">1. 대여 기간 선택</h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      먼저 대여 기간을 선택하면 아래 기기 목록이 현재 운영 방식에 맞게 표시됩니다.
                    </p>
                  </div>

                  <div className="rounded-full border border-orange-100 bg-orange-50 px-3 py-1 text-[11px] font-semibold mk-brand-text">
                    {isPeriodBasedRentalMode ? '기간 기반 예약 사용 중' : '기기 상태 기준 운영 중'}
                  </div>
                </div>

                {rentalPeriodFields}

                <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-[11px] font-semibold text-slate-500">선택한 대여 기간</div>
                    <div className="mt-1 text-sm font-bold text-slate-900">
                      {formatDateWithKoreanWeekday(form.startDate)} ~ {formatDateWithKoreanWeekday(form.dueDate)}
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                      대여가능일은 최대 {getSafeMaxRentalDays(data.settings)}영업일입니다.
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-[11px] leading-relaxed text-slate-500 lg:max-w-[23rem]">
                    {isPeriodBasedRentalMode
                      ? '같은 기기라도 기존 신청 기간과 겹치지 않으면 신청할 수 있습니다.'
                      : '신청중, 대여중, 보류 상태인 기기는 선택 기간과 관계없이 신청할 수 없습니다.'}
                  </div>
                </div>

                {rentalStartAdjustmentInfo.adjusted && (
                  <div className="mt-4 rounded-xl border border-orange-100 bg-orange-50 px-4 py-3 text-xs leading-relaxed text-orange-700">
                    {rentalStartAdjustmentInfo.reasons.length > 0
                      ? `${rentalStartAdjustmentInfo.reasons.join(', ')} 기준으로 대여 시작일이 다음 영업일(${formatDateWithKoreanWeekday(rentalStartAdjustmentInfo.adjustedDate)})로 조정되었습니다.`
                      : `대여 시작일이 다음 영업일(${formatDateWithKoreanWeekday(rentalStartAdjustmentInfo.adjustedDate)})로 조정되었습니다.`}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 lg:items-start">
            
            {/* 좌측 자산 카드 셀렉터 (2컬럼 폭 차지) */}
            <div className="lg:col-span-2 space-y-4">
              <Card>
                <CardContent className="p-6">
                  <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                    <div className="shrink-0">
                      <h2 className="text-lg font-bold text-slate-900">2. {rentalDeviceSectionTitle}</h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {rentalDeviceSectionDescription}
                      </p>
                    </div>
                    <div className="grid w-full gap-2 sm:grid-cols-[120px_120px_minmax(0,1fr)] lg:w-auto lg:grid-cols-[118px_118px_15rem]">
                      <select
                        aria-label="자산 카테고리 필터"
                        value={selectedAssetCategory}
                        onChange={(e) => {
                          setSelectedAssetCategory(e.target.value);
                          setSelectedLaptopId(null);
                        }}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none transition mk-form-focus"
                      >
                        <option value="전체">전체</option>
                        {(data.assetCategories || []).map((category) => (
                          <option key={category} value={category}>{category}</option>
                        ))}
                      </select>

                      <select
                        aria-label="대여 가능여부 필터"
                        value={availabilityFilter}
                        onChange={(e) => {
                          setAvailabilityFilter(e.target.value);
                          setSelectedLaptopId(null);
                        }}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none transition mk-form-focus"
                      >
                        <option value="전체">전체</option>
                        <option value={STATUS.AVAILABLE}>{availableFilterLabel}</option>
                        <option value={STATUS.UNAVAILABLE}>{unavailableFilterLabel}</option>
                      </select>

                      <div className="relative w-full">
                        <Search className="absolute left-3 top-3 text-slate-400" size={16} />
                        <input
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="자산관리번호, 기종, 키워드 검색"
                          className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-xs outline-none transition mk-form-focus"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {filteredLaptops.map((l) => {
                      const laptopAvailability = getLaptopRentalAvailability(
                        l,
                        data.requests,
                        data.settings,
                        form.startDate,
                        form.dueDate
                      );
                      const blocked = laptopAvailability.blocked;
                      const statusLabel = getUserLaptopStatusLabel(laptopAvailability);
                      const isSelected = selectedLaptopId === l.id;
                      return (
                        <motion.button
                          whileHover={!blocked ? { y: -4 } : {}}
                          key={l.id}
                          onClick={() => {
			    if (blocked) return;
			    setSelectedLaptopId(isSelected ? null : l.id);
			  }}
                          className={`group relative overflow-hidden rounded-2xl border text-left transition-all ${
                            isSelected
                              ? 'border-blue-500 ring-4 ring-blue-50 bg-blue-50/10'
                              : 'border-slate-200 bg-white hover:shadow-md'
                          } ${blocked ? 'cursor-not-allowed opacity-60 bg-slate-50/50' : 'cursor-pointer'}`}
                        >
                          <div className="p-1 pt-[10px]">
                            <div className="relative h-32 w-full overflow-hidden rounded-xl bg-slate-100">
                              <img
                                src={l.photo}
                                alt={l.assetNo}
                                className="h-full w-full object-cover transition duration-350 group-hover:scale-105"
                              />
                              {blocked && (
                                <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[1px] flex items-center justify-center text-white text-xs font-bold gap-1">
                                  <LockIcon size={14} /> {statusLabel}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="space-y-2 p-4 pt-3">
                            <div className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                              {l.category || '노트북'}
                            </div>
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-sm font-bold text-slate-900 tracking-tight">{l.assetNo}</span>
                              <Badge>{statusLabel}</Badge>
                            </div>
                            <div className="text-xs font-semibold text-slate-700">{l.model}</div>
                            <div className="space-y-0.5 text-[11px] text-slate-500">
                              <div>S/N: {l.serialNo}</div>
                              <div>출고일: {l.manufactureDate}</div>
                            </div>
                            <div className="mt-1 rounded-lg bg-slate-100 p-2 text-[11px] text-slate-600 border border-slate-200/50">
                              💡 {l.note || '특이사항 없음'}
                            </div>
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 우측 대여 신청 패널 (1컬럼 폭 차지)
                sticky & top-24 속성을 명시하여 스크롤할 때 우측 가이드 폼이 화면에 우아하게 안착 고정됩니다. */}
            <div className="lg:col-span-1 lg:sticky lg:top-24 h-fit">
              <Card className="mk-brand-border-soft shadow-md shadow-slate-100">
                <div
                  className="px-6 py-4 text-white"
                  style={{ background: 'linear-gradient(90deg, var(--mk-orange-dark), var(--mk-orange))' }}
                >
                  <h2 className="text-lg font-bold text-white">3. 신청 정보 입력</h2>
                  <p className="mt-0.5 text-xs text-orange-100">
                    선택한 기기와 신청자 정보를 확인한 뒤 신청을 접수해 주세요.
                  </p>
                </div>
                <CardContent className="space-y-4 p-6">
                  <div>
                    <div className="mb-1.5 text-xs font-semibold text-slate-600 tracking-wide">
                      대여 기기
                    </div>

                    <div className={`rounded-xl px-4 py-3 border text-xs transition-colors duration-150 ${
                      selectedLaptop 
                        ? 'bg-blue-50 border-blue-200 text-blue-800' 
                        : 'bg-slate-50 border-slate-200 text-slate-500'
                    }`}>
                      {selectedLaptop ? (
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                              {selectedLaptop.category || '노트북'}
                            </span>
                            <b className="text-sm ml-1">{selectedLaptop.assetNo}</b>
                          </div>
                          <button onClick={() => setSelectedLaptopId(null)} className="shrink-0 text-blue-500 hover:text-blue-800 font-bold">
                            변경
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <Info size={14} className="text-slate-400" />
                          <span>대여 기간을 확인한 뒤, 기기 선택 섹션에서 대여할 기기를 선택해 주세요.</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="mb-1.5 text-xs font-semibold text-slate-600 tracking-wide">
                      신청자
                    </div>
                    <div className="text-sm font-bold text-slate-900">
                      {userProfile.team || '-'} · {userProfile.name || '-'}
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                      신청자 정보는 현재 로그인 계정의 회원정보를 자동으로 사용하며 직접 변경할 수 없습니다.
                    </p>
                  </div>

                  {/* 선택한 대여 기간 요약 표시 */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="mb-1.5 text-xs font-semibold text-slate-600 tracking-wide">
                      대여 기간
                    </div>
                    <div className="text-sm font-bold leading-relaxed text-slate-900">
                      {formatDateWithKoreanWeekday(form.startDate)}
                      <span className="mx-1 text-slate-400">~</span>
                      {formatDateWithKoreanWeekday(form.dueDate)}
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                      대여 기간은 상단의 1. 대여 기간 선택 영역에서 변경할 수 있습니다.
                    </p>
                  </div>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-600">대여 목적</span>
                    <textarea
                      value={form.purpose}
                      onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                      className="h-20 w-full rounded-xl border border-slate-200 p-3 text-xs outline-none mk-form-ring-focus"
                      placeholder="출장용, 회의용, 교육 연수 등"
                    />
                  </label>

                  <Button
                    onClick={submitRequest}
                    disabled={
                      requestSubmitLoading ||
                      currentUserRentalRestrictionStatus?.blocked ||
                      !selectedLaptop ||
                      selectedLaptopAvailability?.blocked
                    }
                    className="w-full justify-center rounded-xl py-6"
                  >
                    {requestSubmitLoading
                      ? '대여 신청 저장 중...'
                      : '기기 대여 신청'}
                  </Button>
                </CardContent>
              </Card>
            </div>
            </div>
            </div>
  );
}
